# Implementation Plan: Stripe Checkout

## Overview

This plan implements end-to-end Stripe Checkout in a Next.js App Router application: cart submission → server-side Checkout Session creation → Stripe-hosted payment → webhook-driven Order persistence with idempotency → reconciliation cron. Tasks are ordered so each phase produces a runnable increment. Database migrations and Stripe SDK setup must be completed before API routes; API routes before UI integration; webhook handler before reconciliation.

Estimated effort: ~3 engineer-days for a developer familiar with Next.js and Stripe.

## Tasks

- [ ] 1. Environment and Stripe SDK setup
  - [ ] 1.1 Add `stripe`, `server-only`, and `@stripe/stripe-js` to dependencies (`pnpm add stripe server-only @stripe/stripe-js`)
  - [ ] 1.2 Create `lib/stripe.ts` with `server-only` guard, Stripe singleton (`new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" })`), and JSDoc on the exported `stripe` object
  - [ ] 1.3 Add environment variable entries to `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_LOCAL`, `NEXT_PUBLIC_URL`, `CRON_SECRET`
  - [ ] 1.4 Confirm that `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are absent from any `NEXT_PUBLIC_` prefix and not referenced in any Client Component
  - _Requirements: R1.1, R4.1_

- [ ] 2. Database schema and migrations
  - [ ] 2.1 Add `PendingCheckout` model to `prisma/schema.prisma` with fields: `id`, `userId`, `stripeSessionId` (unique, nullable), `status` (enum: `PENDING | COMPLETED | EXPIRED`), `cartSnapshot` (Json), `createdAt`, `updatedAt`; add `@@index([status, createdAt])`
  - [ ] 2.2 Add `Order` model with fields: `id`, `userId`, `pendingCheckoutId` (unique FK), `stripeSessionId` (unique), `stripePaymentIntentId` (unique), `status` (enum: `CONFIRMED | REFUNDED | DISPUTED | CANCELLED`), `currency`, `totalAmountCents`, `createdAt`, `updatedAt`; add `@@index([userId, createdAt(sort: Desc)])`
  - [ ] 2.3 Add `OrderItem` model with fields: `id`, `orderId` (FK cascade delete), `productId` (FK), `name`, `quantity`, `unitPriceCents`
  - [ ] 2.4 Add `Payment` model with fields: `id`, `orderId` (unique FK), `stripePaymentIntentId` (unique), `amountCents`, `currency`, `status` (enum: `SUCCEEDED | REQUIRES_ACTION | FAILED`), `stripeChargeId` (nullable), `receiptUrl` (nullable), `createdAt`
  - [ ] 2.5 Run `pnpm prisma migrate dev --name add-stripe-checkout` and verify migration is reversible with `prisma migrate reset` in CI
  - [ ] 2.6 Add `@@unique` constraint enforcement test: seed two Orders with same `stripeSessionId`, assert Prisma throws `P2002`
  - _Requirements: R4.3, R4.4, R5.1, R6.1_

- [ ] 3. Data access layer (repositories)
  - [ ] 3.1 Create `lib/db/pending-checkouts.ts` with functions: `createPendingCheckout(userId, cartSnapshot)`, `setPendingCheckoutSessionId(id, stripeSessionId)`, `markCompleted(id, tx?)`, `markExpired(id)`, `findStalePending(olderThanMinutes: number)`
  - [ ] 3.2 Create `lib/db/orders.ts` with functions: `findOrderBySessionId(stripeSessionId)`, `findOrdersByUser(userId, page, perPage)`, `findOrderByIdForUser(orderId, userId)`, `createOrderWithItems(data, tx)`
  - [ ] 3.3 Write unit tests for `findStalePending`: mock `db.pendingCheckout.findMany`; assert correct `where` clause filters by `status === "PENDING"` and `createdAt` threshold
  - [ ] 3.4 Write unit tests for `findOrderBySessionId`: assert returns `null` on miss and Order on hit
  - _Requirements: R6.1, R6.2, R7.1_

- [ ] 4. Shared Zod schemas
  - [ ] 4.1 Create `lib/checkout/schemas.ts` with `CartItemSchema` (`productId: z.string().cuid()`, `quantity: z.number().int().min(1).max(100)`), `CreateSessionRequestSchema` (`items: z.array(CartItemSchema).min(1).max(50)`), and `CreateSessionResponseSchema`
  - [ ] 4.2 Export TypeScript types inferred from each schema
  - [ ] 4.3* Write Zod unit tests covering: empty items array (expect fail), quantity 0 (expect fail), invalid CUID (expect fail), valid payload (expect pass)
  - _Requirements: R1.4_

- [ ] 5. Checkout Session creation — business logic
  - [ ] 5.1 Create `lib/checkout/create-session.ts` with `createCheckoutSession(userId: string, items: CartItem[]): Promise<{ url: string }>`: resolve prices from DB by `productId`, throw `InvalidProductError` if any product not found, create `pending_checkout` row, call `stripe.checkout.sessions.create` with server-resolved `line_items` and `idempotencyKey: "checkout-session-${pendingId}"`, update `pending_checkout.stripeSessionId`, return `{ url: session.url }`
  - [ ] 5.2 Define `InvalidProductError extends Error` in `lib/checkout/errors.ts`
  - [ ] 5.3* Write unit test: mock `db.product.findMany` to return one product when two requested; assert `InvalidProductError` thrown; assert `stripe.checkout.sessions.create` NOT called
  - [ ] 5.4* Write unit test: happy path with two products; assert `line_items` uses `stripePriceId` from DB (not from request); assert `stripe.checkout.sessions.create` called with idempotency key
  - _Requirements: R1.1, R1.2, R1.5, R1.6, R5.4_

- [ ] 6. `POST /api/checkout/create-session` route handler
  - [ ] 6.1 Create `app/api/checkout/create-session/route.ts`; parse `req.json()` and validate with `CreateSessionRequestSchema`; call `getServerSession` and return 401 if unauthenticated; call `createCheckoutSession`; return `NextResponse.json({ url }, { status: 303 })`
  - [ ] 6.2 Map errors to HTTP responses: `InvalidProductError` → 400 `INVALID_PRODUCT`; Zod parse error → 400 with field details; Stripe error → 502 `STRIPE_ERROR`
  - [ ] 6.3* Write integration test using a test DB: seed two products; call route with valid cart; assert `pending_checkout` row created; assert Stripe `sessions.create` called; assert response `url` matches Stripe mock return value
  - _Requirements: R1.1, R1.3, R1.4, R1.5_

- [ ] 7. Webhook handler — business logic
  - [ ] 7.1 Create `lib/checkout/webhook-handler.ts` with `handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void>`: check `session.payment_status === "paid"`, early-return if not; call `findOrderBySessionId(session.id)`, early-return with info log if already exists; retrieve `pending_checkout` by `stripeSessionId`; run `db.$transaction` to create `Order`, `OrderItem[]`, `Payment`, and update `pending_checkout.status = "COMPLETED"`; catch Prisma unique constraint error (`P2002`) and treat as duplicate
  - [ ] 7.2* Write unit test — happy path: mock `findOrderBySessionId` returns null; mock transaction succeeds; assert `order.create` called with correct fields including `stripePaymentIntentId`
  - [ ] 7.3* Write unit test — duplicate (application check): mock `findOrderBySessionId` returns existing Order; assert `db.$transaction` NOT called; function returns without error
  - [ ] 7.4* Write unit test — duplicate (race condition / P2002): mock `findOrderBySessionId` returns null, transaction throws `P2002`; assert function returns without re-throwing
  - [ ] 7.5* Write unit test — `payment_status !== "paid"`: assert early return, no DB calls
  - _Requirements: R4.3, R4.4, R4.5, R4.7, R4.8, R5.1, R5.2_

- [ ] 8. `POST /api/webhooks/stripe` route handler
  - [ ] 8.1 Create `app/api/webhooks/stripe/route.ts` with `export const runtime = "nodejs"`; read raw body with `req.text()`; call `stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!)`; return 400 with security log on `WebhookSignatureVerificationError`
  - [ ] 8.2 Add `switch` on `event.type`: handle `checkout.session.completed` and `checkout.session.async_payment_succeeded` by calling `handleCheckoutSessionCompleted`; handle `checkout.session.async_payment_failed` by marking `pending_checkout` as expired and logging; default case returns 200 with info log
  - [ ] 8.3 Wrap `handleCheckoutSessionCompleted` call in try/catch: re-throw any non-P2002 errors so the route returns 500 and Stripe retries
  - [ ] 8.4* Write integration test: use `stripe.webhooks.generateTestHeaderString` to construct a valid signature; call route; assert 200 and Order created
  - [ ] 8.5* Write integration test — invalid signature: send tampered payload; assert 400; assert no DB writes
  - [ ] 8.6* Write integration test — duplicate delivery: call route twice with identical signed payload; assert exactly one Order row in DB; both calls return 200
  - _Requirements: R4.1, R4.2, R4.5, R4.8_

- [ ] 9. Cart UI and checkout initiation
  - [ ] 9.1 Create `CartClient.tsx` (Client Component) with a "Proceed to Checkout" button; on click, POST to `/api/checkout/create-session` with `{ items: cartItems }` and redirect to `data.url` using `window.location.href`
  - [ ] 9.2 Add loading state (spinner, button disabled) while waiting for the API response
  - [ ] 9.3 Add error toast when API returns 400 or 502; preserve cart contents on error
  - [ ] 9.4 Wrap `CartPage` (Server Component) with `CartClient` for interactive checkout; pass cart items as props
  - _Requirements: R1.3, R1.4, R2.1_

- [ ] 10. Success and cancel pages
  - [ ] 10.1 Create `app/(shop)/checkout/success/page.tsx` (Server Component): extract `session_id` from `searchParams`; return 404 if absent or not matching a known `pending_checkout`; if Order exists, render order summary immediately
  - [ ] 10.2 Create `OrderPoller.tsx` (Client Component): if Order not yet available, poll `GET /api/orders?sessionId=cs_xxx` every 2 seconds for up to 30 seconds; render "Payment received — confirming your order" skeleton; on success render order summary; on timeout render "Your order is being processed" with `session_id` as reference and a support link
  - [ ] 10.3 Create `app/(shop)/checkout/cancel/page.tsx` (Server Component): reads cart from session/cookie and renders cart contents with a "Return to checkout" button
  - [ ] 10.4* Write component test for `OrderPoller`: mock `/api/orders` to return 404 three times then 200; assert skeleton shown during polling; assert order summary shown after success
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 11. Order history pages
  - [ ] 11.1 Create `app/account/orders/page.tsx` (Server Component): call `findOrdersByUser(session.user.id, page, 20)`; render paginated list with status badge; redirect to `/api/auth/signin` if unauthenticated
  - [ ] 11.2 Create `app/account/orders/[orderId]/page.tsx` (Server Component): call `findOrderByIdForUser(orderId, session.user.id)`; return 404 on miss; render order detail with items and receipt URL
  - [ ] 11.3 Create `GET /api/orders/[orderId]/route.ts`: authenticate; authorize (owner or admin); return serialized Order with items and payment; return 403 if not authorized
  - [ ] 11.4* Write integration test for `GET /api/orders/[orderId]`: assert 200 for owner; assert 403 for different authenticated user; assert 401 for unauthenticated
  - _Requirements: R6.2, R6.3, R6.4_

- [ ] 12. Reconciliation job
  - [ ] 12.1 Create `lib/jobs/reconciliation.ts` with `runReconciliation(): Promise<{ processed: number; errors: number }>`: call `findStalePending(30)`; for each record call `stripe.checkout.sessions.retrieve(stripeSessionId)`; if `payment_status === "paid"` and no Order exists, call `handleCheckoutSessionCompleted` with the retrieved session; if `payment_status === "unpaid"` and `expires_at < Date.now() / 1000`, call `markExpired`; catch per-record Stripe errors, log, and continue
  - [ ] 12.2 Create `app/api/cron/reconcile/route.ts`: verify `Authorization: Bearer ${process.env.CRON_SECRET}`; call `runReconciliation()`; return `{ processed, errors }`
  - [ ] 12.3 Add Vercel Cron configuration in `vercel.json`: `{ "crons": [{ "path": "/api/cron/reconcile", "schedule": "*/15 * * * *" }] }`
  - [ ] 12.4* Write unit test for `runReconciliation`: seed three stale records — one paid (no order), one unpaid expired, one that throws Stripe error; assert Order created for first, `markExpired` called for second, error logged and loop continues for third; assert return value `{ processed: 2, errors: 1 }`
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5_

- [ ] 13. End-to-end tests (Playwright)
  - [ ] 13.1* Happy path: add product to cart → POST create-session → mock Stripe redirect → trigger `checkout.session.completed` webhook via Stripe CLI → assert `/checkout/success` shows order summary → assert order in `/account/orders`
  - [ ] 13.2* Card declined: use Stripe test card `4000 0000 0000 0002`; assert no Order row; assert cart intact on cancel URL
  - [ ] 13.3* Duplicate webhook: trigger `checkout.session.completed` twice for same session; assert exactly one Order row; both webhook calls return 200
  - [ ] 13.4* Reconciliation end-to-end: seed stale `pending_checkout` with real `stripeSessionId` (from Stripe test mode); call `/api/cron/reconcile` with `CRON_SECRET`; assert Order created
  - _Requirements: R1.1–R1.6, R4.1–R4.8, R5.1–R5.4, R7.1–R7.5_

- [ ] 14. Security audit and hardening
  - [ ] 14.1 Verify `lib/stripe.ts` has `import "server-only"` at top; run `next build` and confirm no client bundle warnings about Stripe secret key
  - [ ] 14.2 Audit `create-session.ts`: confirm zero references to `req.body` price or amount fields; confirm all amounts come from `db.product.findMany` result
  - [ ] 14.3 Add `Content-Security-Policy` header allowing `https://checkout.stripe.com` in `next.config.ts` headers config
  - [ ] 14.4 Confirm `CRON_SECRET` check in reconcile route returns 401 if header absent or incorrect
  - [ ] 14.5 Run `pnpm audit` and resolve any high-severity findings in Stripe SDK or webhook-related dependencies
  - _Requirements: R1.2, R4.1, R4.2_

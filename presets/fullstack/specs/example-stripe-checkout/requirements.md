# Requirements Document

## Introduction

This document specifies requirements for integrating Stripe Checkout into a Next.js (App Router, T3-style) e-commerce application. The feature enables customers to pay for items in their cart via Stripe's hosted checkout page, with server-side order persistence driven by Stripe webhooks rather than client-side redirects. The integration must be resilient to webhook delivery failures, duplicate events, and payment edge cases.

**Scope:** Cart review → Checkout Session creation → Stripe-hosted payment → webhook-driven order fulfillment → reconciliation. Refunds and subscription billing are out of scope.

## Glossary

| Term | Definition |
|------|------------|
| Checkout Session | A Stripe object (`checkout.Session`) that represents a single payment attempt; created server-side and identified by `cs_xxx`. |
| Checkout Session ID | The `id` field on a `checkout.Session` object; used as the idempotency key for webhook processing. |
| `checkout.session.completed` | Stripe webhook event fired when a customer successfully completes payment on the hosted checkout page. |
| Idempotency Key | A unique value (`Stripe-Idempotency-Key` header or our internal `stripeSessionId` column) that prevents the same operation from being applied more than once. |
| Order | Application-level record created after a successful payment is confirmed via webhook. |
| Payment | Record of a payment attempt linked to an Order, storing Stripe `paymentIntentId`, amount, currency, and status. |
| Webhook Signature | The `Stripe-Signature` header Stripe attaches to every webhook request; verified using `stripe.webhooks.constructEvent`. |
| Reconciliation | Periodic process that cross-references Stripe's API with the local database to catch orders whose webhooks were never delivered. |
| CartItem | A line item in the customer's cart, containing a product ID, quantity, and server-resolved unit price. |
| Success URL | The `/checkout/success?session_id={CHECKOUT_SESSION_ID}` page shown after payment. |
| Cancel URL | The `/checkout/cancel` page shown when a customer abandons the Stripe-hosted form. |

## Requirements

### Requirement 1: Checkout Session Creation

**User Story:** As a customer, I want to click "Proceed to Checkout" and be redirected to Stripe's hosted payment page, so that I can pay securely without entering card details on the merchant site.

#### Acceptance Criteria

1. WHEN a customer submits a non-empty cart to `POST /api/checkout/create-session`, THE SYSTEM SHALL create a `checkout.Session` via the Stripe API with `mode: "payment"`, `line_items` derived from server-resolved product prices, and `success_url`/`cancel_url` pointing to the application's return pages.
2. WHEN constructing `line_items`, THE SYSTEM SHALL fetch unit prices from the database keyed by product ID and SHALL NOT use any price values supplied by the client.
3. WHEN the Stripe API returns a session URL, THE SYSTEM SHALL respond with `{ url: string }` and HTTP 303, and the client SHALL redirect the browser to that URL.
4. IF the customer's cart is empty or contains a product ID that does not exist in the catalog, THEN THE SYSTEM SHALL return HTTP 400 with a structured error before contacting the Stripe API.
5. IF the Stripe API call fails (network error or Stripe 5xx), THEN THE SYSTEM SHALL return HTTP 502 and log the error; the cart contents SHALL remain unchanged.
6. WHERE a Checkout Session is created, THE SYSTEM SHALL store `{ stripeSessionId, userId, status: "pending", cartSnapshot, createdAt }` in a `pending_checkout` table to enable reconciliation.

### Requirement 2: Stripe-Hosted Checkout Page

**User Story:** As a customer, I want to be taken directly to Stripe's secure payment form, so that I can enter my card details in a PCI-compliant environment.

#### Acceptance Criteria

1. WHEN the browser is redirected to the Stripe-hosted URL, THE SYSTEM SHALL have configured the session with `payment_method_types: ["card"]` (and optionally `["link", "apple_pay", "google_pay"]` based on environment configuration).
2. WHEN the customer's session expires (Stripe sessions expire after 24 hours), THEN THE SYSTEM SHALL return the customer to the cancel URL, and the expired `pending_checkout` record SHALL be marked `status: "expired"` by the reconciliation job.
3. IF the customer's card is declined, THEN Stripe SHALL surface the decline message on the hosted page; THE SYSTEM SHALL NOT receive a `checkout.session.completed` event, and no Order record SHALL be created.
4. WHEN creating the session, THE SYSTEM SHALL set `metadata.internalOrderRef` to the pending checkout's primary key so the webhook handler can correlate events without re-querying by session ID alone.

### Requirement 3: Success and Cancel Return Handling

**User Story:** As a customer, I want to see a confirmation page after paying, so that I know my order was placed; and a cancellation page if I go back, so I can return to my cart.

#### Acceptance Criteria

1. WHEN the customer completes payment and Stripe redirects to `/checkout/success?session_id={CHECKOUT_SESSION_ID}`, THE SYSTEM SHALL retrieve the Order record keyed by `stripeSessionId` and display the order summary.
2. WHILE the webhook has not yet been processed (Order record not yet created), THE SYSTEM SHALL display a "Payment received — we are confirming your order" message and poll or use server-sent events until the Order appears, for up to 30 seconds before showing a support link.
3. IF no Order exists after 30 seconds, THE SYSTEM SHALL NOT mark the payment as failed on the client; it SHALL log the delayed webhook and display a "Your order is being processed" message with an order reference number derived from the Checkout Session ID.
4. WHEN the customer clicks "Back" on the Stripe page and lands on `/checkout/cancel`, THE SYSTEM SHALL display the cart contents intact and offer the customer a button to retry checkout.
5. WHERE the `session_id` query parameter on the success page is absent or does not match a known `pending_checkout`, THE SYSTEM SHALL return a 404 page.

### Requirement 4: Webhook Processing for `checkout.session.completed`

**User Story:** As a system operator, I want every successful payment to be reliably recorded in the database, so that orders are fulfilled even if the customer closes the browser before reaching the success page.

#### Acceptance Criteria

1. WHEN Stripe posts to `POST /api/webhooks/stripe`, THE SYSTEM SHALL verify the `Stripe-Signature` header using `stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)` before processing any payload.
2. IF signature verification fails, THEN THE SYSTEM SHALL return HTTP 400 and log a security warning; no database writes SHALL occur.
3. WHEN the event type is `checkout.session.completed` and `session.payment_status` is `"paid"`, THE SYSTEM SHALL create an `Order` record and a linked `Payment` record within a single database transaction.
4. WHEN creating an `Order`, THE SYSTEM SHALL set `stripeSessionId`, `stripePaymentIntentId`, `userId`, `totalAmountCents`, `currency`, `status: "confirmed"`, and line items derived from the `pending_checkout.cartSnapshot`.
5. IF an `Order` with the same `stripeSessionId` already exists (duplicate webhook), THEN THE SYSTEM SHALL return HTTP 200 without creating a second Order; the duplicate event SHALL be logged at the `info` level.
6. WHEN `session.payment_status` is `"unpaid"` (e.g., the session was completed but payment is async), THE SYSTEM SHALL record the event for reconciliation and return HTTP 200 without creating an Order.
7. WHEN the Order and Payment records are persisted, THE SYSTEM SHALL update `pending_checkout.status` to `"completed"` within the same transaction.
8. WHEN any database error occurs during Order creation, THE SYSTEM SHALL return HTTP 500 so Stripe retries the webhook; it SHALL NOT return 200 on partial failure.

### Requirement 5: Idempotency and Duplicate-Event Safety

**User Story:** As a system operator, I want the webhook handler to be idempotent, so that Stripe's automatic retries never create duplicate orders or charge customers twice.

#### Acceptance Criteria

1. WHERE the `stripeSessionId` column on the `Order` table has a `UNIQUE` constraint, THE SYSTEM SHALL rely on that constraint as a secondary guard against duplicates even if the application-level check (R4.5) is bypassed due to a race condition.
2. WHEN two concurrent webhook requests for the same `checkout.session.completed` arrive simultaneously, THE SYSTEM SHALL process exactly one; the second SHALL receive HTTP 200 after detecting the unique constraint violation and rolling back.
3. IF Stripe sends a `checkout.session.completed` event more than once for the same session (any retry interval), THE SYSTEM SHALL handle it idempotently on every retry.
4. WHEN creating a Checkout Session via the Stripe API, THE SYSTEM SHALL pass an `idempotencyKey` header equal to `"checkout-session-{pendingCheckoutId}"` so Stripe deduplicates API calls on network timeout retries.

### Requirement 6: Order Persistence and Fulfillment

**User Story:** As a customer, I want to view my order history after paying, so that I have a record of what I purchased and can track fulfillment.

#### Acceptance Criteria

1. WHEN an `Order` is created, THE SYSTEM SHALL persist: `id`, `userId`, `stripeSessionId`, `stripePaymentIntentId`, `status`, `currency`, `totalAmountCents`, `createdAt`, `updatedAt`, and a JSON array of `OrderItem` records (productId, quantity, unitPriceCents, name).
2. WHEN a customer visits `/account/orders`, THE SYSTEM SHALL list all Orders belonging to `session.user.id`, most-recent first, with pagination (default 20 per page).
3. IF an Order has `status: "confirmed"`, THE SYSTEM SHALL display a "Confirmed" badge; if `status: "refunded"` or `status: "disputed"`, the appropriate badge SHALL be shown.
4. WHERE an Order exists, THE SYSTEM SHALL expose a `GET /api/orders/[orderId]` endpoint that returns the Order and its items only to the authenticated owner or an admin role.

### Requirement 7: Reconciliation Job

**User Story:** As a system operator, I want a scheduled job that detects missed webhooks, so that orders from successful payments are never permanently lost due to transient webhook delivery failures.

#### Acceptance Criteria

1. WHEN the reconciliation job runs (scheduled every 15 minutes via a cron or Vercel Cron), THE SYSTEM SHALL query all `pending_checkout` records with `status: "pending"` and `createdAt` older than 30 minutes.
2. FOR EACH stale pending checkout, THE SYSTEM SHALL call `stripe.checkout.sessions.retrieve(stripeSessionId)` and check `session.payment_status`.
3. IF `session.payment_status` is `"paid"` and no Order exists for that session, THEN THE SYSTEM SHALL create the Order as if the webhook had arrived (using the same transaction logic as R4.3–R4.4).
4. IF `session.payment_status` is `"unpaid"` and the session `expires_at` has passed, THEN THE SYSTEM SHALL mark `pending_checkout.status` as `"expired"`.
5. WHEN the reconciliation job encounters a Stripe API error for a specific session, THE SYSTEM SHALL log the error and continue processing remaining records; it SHALL NOT abort the entire batch.

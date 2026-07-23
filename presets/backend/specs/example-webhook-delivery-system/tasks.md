# Implementation Plan: Webhook Delivery System

## Overview

This plan builds the outbound webhook delivery system from the database schema and secrets infrastructure upward through signing, delivery workers, retry logic, DLQ handling, the event router, and the REST API. Tasks are ordered so each layer can be tested before the layer that depends on it is built. Tasks marked `*` include automated tests as part of their definition of done. Traceability references point to specific acceptance criteria in `requirements.md`.

## Tasks

- [ ] 1. Database Schema and Migrations
  - [ ] 1.1 Write migration: create `webhook_endpoints` table with all columns, constraints, and check on `url ~ '^https://'`
  - [ ] 1.2 Write migration: create `webhook_deliveries` table; add FK constraint to `webhook_endpoints`
  - [ ] 1.3 Write migration: create `webhook_attempts` table; add FK constraint to `webhook_deliveries`
  - [ ] 1.4 Create indexes: `idx_wh_endpoints_customer_active` (partial, `WHERE active = true`), `idx_wh_endpoints_events` (GIN on `events` array), `idx_wh_deliveries_endpoint_status`, `idx_wh_deliveries_customer_enqueued`, `idx_wh_attempts_delivery`
  - [ ] 1.5* Write migration smoke tests: assert all tables and indexes exist; assert `url` check constraint rejects `http://` URLs; assert `status` check constraint rejects invalid values; assert FK cascade behaviour on endpoint deletion
  - _Requirements: R1.4, R2.2, R6.3_

- [ ] 2. Core Types, Config, and Error Classes
  - [ ] 2.1 Define `WebhookEndpoint`, `WebhookDelivery`, `WebhookAttempt`, `DeliveryStatus`, `WebhookConfig` interfaces in `src/webhooks/types.ts`
  - [ ] 2.2 Define `WebhookConfig` in `src/webhooks/config.ts` with defaults: `maxAttempts: 6`, `baseDelay: 5_000`, `maxDelay: 3_600_000`, `requestTimeoutMs: 10_000`, `concurrency: 10`, `stalledInterval: 30_000`, `endpointLimit: 20`
  - [ ] 2.3 Implement error classes in `src/webhooks/errors.ts`: `EndpointNotFoundError`, `DeliveryNotFoundError`, `EndpointLimitError`, `EndpointInactiveError`, `InsecureUrlError`, `InvalidEventTypeError`
  - [ ] 2.4 Define `EVENT_CATALOGUE` in `src/webhooks/catalogue.ts` as a record of event type strings to `{ name, description, examplePayload }` objects
  - [ ] 2.5* Write unit tests: assert error classes extend `Error`; assert `EVENT_CATALOGUE` contains at least 5 entries each with a non-empty `examplePayload`
  - _Requirements: R1.2, R1.3, R7.5_

- [ ] 3. HMAC Signer
  - [ ] 3.1 Implement `sign(secret: string, rawBody: Buffer): string` in `src/webhooks/signer.ts` returning `'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')`
  - [ ] 3.2 Implement `verify(secret, rawBody, signatureHeader, timestampHeader, toleranceSeconds?)` using `crypto.timingSafeEqual`; reject requests where `Math.abs(Date.now()/1000 - ts) > toleranceSeconds`
  - [ ] 3.3* Write unit tests: `sign()` produces known output for fixed secret + body; changing one byte of body produces a different signature; `verify()` returns `true` for valid inputs, `false` for tampered body, `false` for stale timestamp (> 300 s), `false` for mismatched signature length; run 1 000 pairs and assert no false positives
  - [ ] 3.4* Write timing test: send 1 000 invalid signature checks; assert standard deviation of `verify()` call duration < 0.5 ms to confirm constant-time comparison
  - _Requirements: R3.1, R3.2, R3.4, R7.2_

- [ ] 4. Secrets Management Integration
  - [ ] 4.1 Implement `SecretStore` interface in `src/webhooks/repository/endpointRepository.ts` with `get(endpointId): Promise<string>` and `set(endpointId, secret): Promise<void>`; provide a Redis-backed implementation for development (`secrets:{endpointId}`) and an AWS Secrets Manager adapter for production
  - [ ] 4.2 Implement `generateSigningSecret(): string` using `crypto.randomBytes(32).toString('base64url')` and SHA-256 hash helper for the `signingSecretHash` stored in PostgreSQL
  - [ ] 4.3* Write unit tests for `SecretStore` Redis adapter: `set` + `get` round-trip returns the plaintext secret; assert the secret is not visible in the `webhook_endpoints` table (only the hash is)
  - _Requirements: R3.3, R3.4_

- [ ] 5. Endpoint Repository
  - [ ] 5.1 Implement `EndpointRepository.create(data)` in `src/webhooks/repository/endpointRepository.ts`: generate UUID, call `generateSigningSecret()`, store hash in DB, store plaintext in `SecretStore`, return `{ endpoint, signingSecret }` (plaintext returned once only)
  - [ ] 5.2 Implement `EndpointRepository.findActiveByEventType(eventType)`: `SELECT * FROM webhook_endpoints WHERE active = true AND $1 = ANY(events)` using the GIN index
  - [ ] 5.3 Implement `EndpointRepository.getSigningSecret(endpointId)`: call `SecretStore.get(endpointId)`; throw `EndpointNotFoundError` if not found
  - [ ] 5.4 Implement `EndpointRepository.deactivate(endpointId)`: `UPDATE webhook_endpoints SET active = false WHERE id = $1`
  - [ ] 5.5 Implement `EndpointRepository.rotateSecret(endpointId, gracePeriodSeconds)`: generate new secret, update DB columns `signing_secret_hash`, `previous_secret_hash`, `rotation_expires_at`, update `SecretStore`
  - [ ] 5.6 Implement `EndpointRepository.list(customerId, pagination)` returning `ApiKeyMetadata`-style page response excluding `signingSecretHash` and `previousSecretHash`
  - [ ] 5.7* Write repository integration tests against Docker PostgreSQL: `create` + `findActiveByEventType` round-trip; `deactivate` removes endpoint from `findActiveByEventType` results; `list` never returns hash fields; cross-customer isolation (customer A cannot see customer B's endpoints)
  - _Requirements: R1.1, R1.4, R1.5, R1.6, R3.4, R3.5_

- [ ] 6. Delivery and Attempt Repositories
  - [ ] 6.1 Implement `DeliveryRepository.create(delivery)`: INSERT into `webhook_deliveries`, return the created row
  - [ ] 6.2 Implement `DeliveryRepository.markSucceeded(id, succeededAt, attemptsMade)`: UPDATE status + succeeded_at
  - [ ] 6.3 Implement `DeliveryRepository.markDeadLettered(id, deadLetteredAt)`: UPDATE status + dead_lettered_at
  - [ ] 6.4 Implement `DeliveryRepository.markPermanentFailure(id)`: UPDATE `permanent_failure = true`, `status = 'failed'`
  - [ ] 6.5 Implement `DeliveryRepository.findById(id)` joining `webhook_attempts`; throw `DeliveryNotFoundError` if not found
  - [ ] 6.6 Implement `DeliveryRepository.list(filters, pagination)`: `SELECT` with optional `WHERE endpoint_id = $1 AND event_type = $2 AND status = $3 AND enqueued_at BETWEEN $4 AND $5 ORDER BY enqueued_at DESC`
  - [ ] 6.7 Implement `AttemptRepository.create(attempt)`: INSERT into `webhook_attempts`; truncate `responseBody` to 1 024 bytes before storing
  - [ ] 6.8* Write integration tests: create delivery, record 3 attempts with different status codes, assert `findById` returns all 3 attempts in order; assert `list` with `status = 'dead-lettered'` filter returns only dead-lettered deliveries; assert `responseBody` truncation at exactly 1 024 bytes
  - _Requirements: R2.2, R5.6, R6.1, R6.2, R6.3, R6.4_

- [ ] 7. Delivery Queue
  - [ ] 7.1 Implement `DeliveryQueue` class in `src/webhooks/deliveryQueue.ts` wrapping a BullMQ `Queue` named `webhook-deliveries`; expose `enqueue(delivery: WebhookDelivery, opts?: { delay?: number }): Promise<void>` and `getJob(id: string): Promise<BullMQJob | null>`
  - [ ] 7.2 Configure BullMQ queue with `removeOnComplete: { age: 86_400 }` (1 day) and `removeOnFail: false` (DLQ handles retention)
  - [ ] 7.3* Write integration test against Testcontainers Redis: enqueue 5 deliveries, assert 5 jobs visible in `queue.getWaiting()`; enqueue with `delay: 5000`, assert job is in `delayed` state
  - _Requirements: R2.1, R2.2_

- [ ] 8. Delivery Worker
  - [ ] 8.1 Implement `DeliveryWorker` class in `src/webhooks/deliveryWorker.ts` wrapping BullMQ `Worker` on `webhook-deliveries`; configure `concurrency: config.concurrency`, `lockDuration: 60_000` (60 s, longer than `requestTimeoutMs` to prevent stall false positives)
  - [ ] 8.2 Implement the processor function: (a) load endpoint and signing secret; (b) serialise payload to JSON buffer; (c) compute `X-Webhook-Signature` via `Signer.sign()`; (d) POST to endpoint URL with `undici.request()` and `requestTimeoutMs` timeout; (e) read up to 1 024 bytes of response body; (f) call `AttemptRepository.create()` with outcome
  - [ ] 8.3 On 2xx response: call `DeliveryRepository.markSucceeded()`, call `EndpointRepository.updateLastDelivery('succeeded')` (fire-and-forget)
  - [ ] 8.4 On 410 response: call `DeliveryRepository.markPermanentFailure()`, call `EndpointRepository.deactivate()`, throw a `NonRetryableError` to prevent further retries
  - [ ] 8.5 On any other non-2xx or timeout: check if `job.attemptsMade + 1 >= maxAttempts`; if so call `DLQHandler.moveToDLQ()`; otherwise throw a plain `Error` to trigger BullMQ backoff retry
  - [ ] 8.6 Wire BullMQ `'failed'` event to call `DLQHandler.moveToDLQ()` when `attemptsMade >= maxAttempts`; wire `'completed'` event to emit `webhook.delivery_succeeded`
  - [ ] 8.7* Write unit tests with mocked HTTP client: 2xx → `markSucceeded` called; 5xx → retry scheduled; 410 → `deactivate` called + `NonRetryableError` thrown; 6th failure → `DLQHandler.moveToDLQ` called; timeout → `timedOut: true` in attempt record
  - [ ] 8.8* Write integration tests against Docker PostgreSQL + Redis + local HTTP server: full delivery succeeds; retry flow (server initially returns 503, then 200); DLQ flow (server always returns 500, `maxAttempts: 3`)
  - _Requirements: R2.4, R2.5, R2.6, R3.1, R3.2, R4.1, R4.4, R4.6, R5.1_

- [ ] 9. DLQ Handler
  - [ ] 9.1 Implement `DLQHandler.moveToDLQ(job, error)` in `src/webhooks/dlqHandler.ts`: call `job.moveToFailed(error, token, true)`, call `DeliveryRepository.markDeadLettered()`, emit `webhook.dead_lettered` event
  - [ ] 9.2 Implement `DLQHandler.replay(deliveryId)`: load `WebhookDelivery`, check endpoint is active (throw `EndpointInactiveError` if not), create a new `WebhookDelivery` with `sourceDeliveryId = deliveryId` and `attemptsMade: 0`, call `DeliveryQueue.enqueue()`, return `{ replayDeliveryId }`
  - [ ] 9.3* Write unit tests: `moveToDLQ` emits `webhook.dead_lettered`; `replay` on inactive endpoint throws `EndpointInactiveError`; `replay` on active endpoint returns new `replayDeliveryId`; assert `sourceDeliveryId` is set correctly on the new delivery
  - _Requirements: R5.1, R5.2, R5.4, R5.5_

- [ ] 10. Event Router
  - [ ] 10.1 Implement `EventRouter.dispatch(eventType, payload)` in `src/webhooks/eventRouter.ts`: call `EndpointRepository.findActiveByEventType(eventType)`; for each result, call `DeliveryRepository.create()` and `DeliveryQueue.enqueue()`; return without awaiting delivery outcomes
  - [ ] 10.2 If `findActiveByEventType` returns an empty array, log a `debug` event and return silently (no-op)
  - [ ] 10.3* Write unit tests: 3 matching active endpoints → 3 `DeliveryRepository.create()` calls and 3 `DeliveryQueue.enqueue()` calls; 0 matching endpoints → 0 calls; `dispatch` resolves without awaiting HTTP delivery
  - [ ] 10.4* Write integration test: register 2 endpoints for `order.completed`, call `dispatch('order.completed', { orderId: '123' })`, assert 2 BullMQ jobs appear in the queue within 1 s
  - _Requirements: R2.1, R2.3_

- [ ] 11. REST API Endpoints
  - [ ] 11.1 Implement `POST /webhooks/endpoints` in `src/api/routes/webhooks.ts`: validate request body (url, events required; description optional); check HTTPS; check endpoint limit; call `EndpointRepository.create()`; return 201 with `signingSecret` (plaintext, once only)
  - [ ] 11.2 Implement `GET /webhooks/endpoints`: call `EndpointRepository.list(customerId, pagination)`; return 200
  - [ ] 11.3 Implement `DELETE /webhooks/endpoints/:id`: call `EndpointRepository.deactivate(id)`; return 204
  - [ ] 11.4 Implement `POST /webhooks/endpoints/:id/rotate-secret`: call `EndpointRepository.rotateSecret(id, gracePeriodSeconds)`; return 200 with new `signingSecret` (once only) and `gracePeriodEndsAt`
  - [ ] 11.5 Implement `POST /webhooks/endpoints/:id/test`: enqueue a synthetic delivery with `eventType: "webhook.test"`; wait up to 10 s for the first attempt to complete; return `{ status, httpStatusCode, latencyMs }` or `{ status: "unreachable", error }`
  - [ ] 11.6 Implement `GET /webhooks/events`: return all entries from `EVENT_CATALOGUE` as an array
  - [ ] 11.7 Implement `GET /webhooks/deliveries` with query param validation and `DeliveryRepository.list()`; return 200
  - [ ] 11.8 Implement `GET /webhooks/deliveries/:id` with `DeliveryRepository.findById()`; return 200 or 404
  - [ ] 11.9 Implement `POST /webhooks/deliveries/:id/replay`: validate delivery exists; call `DLQHandler.replay(id)`; return 200 `{ replayDeliveryId }`
  - [ ] 11.10 Implement `GET /webhooks/endpoints/:id/stats`: aggregate query over `webhook_deliveries` for the past 7 days; return `{ totalDeliveries, succeeded, failed, deadLettered, successRate, averageLatencyMs }`
  - [ ] 11.11* Write API integration tests for every endpoint: happy-path for each, 400 for invalid URL scheme, 400 for unknown event type, 422 for endpoint limit, 404 for unknown delivery, 409 for replay to inactive endpoint, 201 response does NOT include secret in subsequent GET
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R5.3, R5.4, R5.5, R6.1, R6.2, R6.5, R7.1, R7.3, R7.4, R7.5_

- [ ] 12. End-to-End Verification
  - [ ] 12.1 Stand up a full stack: PostgreSQL + Redis + WebhookAPI + DeliveryWorker + a local test HTTP server (using `nock` or a real Express app in-process)
  - [ ] 12.2 Register 3 endpoints for `order.completed`; call `EventRouter.dispatch('order.completed', { orderId: 'e2e-1' })`; assert 3 `WebhookDelivery` records reach `status: succeeded` within 10 s; assert each has exactly 1 `WebhookAttempt` with `httpStatusCode: 200`
  - [ ] 12.3 HMAC verification: configure the test server to call `Signer.verify()` on every inbound request; assert it returns `true` for all 3 deliveries above
  - [ ] 12.4 Retry flow: configure test server to return 503 twice then 200; dispatch 1 event; assert `status: succeeded`, `attemptsMade: 3`, 3 attempt records with status codes `[503, 503, 200]`
  - [ ] 12.5 DLQ flow: configure test server to always return 500 with `maxAttempts: 3`; dispatch 1 event; assert `status: dead-lettered`, 3 attempt records; call `POST /webhooks/deliveries/:id/replay` after fixing the server; assert replay delivery reaches `succeeded`
  - [ ] 12.6 Poison endpoint: configure test server to return 410; dispatch 1 event; assert `permanent_failure: true`; assert endpoint `active` is `false`; assert a second `dispatch()` skips the deactivated endpoint (0 new deliveries)
  - [ ] 12.7 Secret rotation: rotate secret with `gracePeriodSeconds: 60`; dispatch 1 event; assert the test server can verify using both old and new secrets during the grace period; after grace period only new secret verifies
  - _Requirements: R2.4, R2.6, R3.1, R3.2, R3.5, R4.1, R4.4, R5.1, R5.4, R6.3, R7.1_

- [ ] 13. Update Documentation
  - [ ] 13.1 Add JSDoc to `EventRouter.dispatch()` documenting the fan-out semantics and the guarantee that it returns without awaiting delivery
  - [ ] 13.2 Add JSDoc to `Signer.verify()` with a complete customer-side code snippet (raw body buffer, `X-Webhook-Timestamp` freshness check, `timingSafeEqual` usage)
  - [ ] 13.3 Document the secret rotation workflow in `src/webhooks/repository/endpointRepository.ts` JSDoc including the two-secret acceptance window and the grace period timeline
  - [ ] 13.4 Add a `## Webhooks` section to the project `README.md` covering: quick registration example, signature verification snippet in TypeScript, retry schedule table, DLQ replay runbook, and a note on what NOT to do (parse body before verifying signature, trust `X-Webhook-Signature` without timestamp check)
  - _Requirements: R3.1, R3.2, R7.2, R7.6_

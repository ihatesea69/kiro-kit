# Requirements Document

## Introduction

This document defines the requirements for a reliable outbound webhook delivery system for a Node.js/TypeScript service. The system enables customer applications to register HTTPS endpoint URLs and receive real-time event notifications (e.g. `order.completed`, `payment.failed`) whenever those events occur within the platform. Each delivery is queued via BullMQ, signed with HMAC-SHA256, retried with exponential backoff on failure, and moved to a dead-letter queue (DLQ) after exhausting all attempts. Every delivery attempt is logged with its outcome, allowing operators to query delivery status, debug customer-reported issues, and replay specific events. The design assumes delivery to arbitrary customer-controlled HTTPS endpoints with unknown reliability characteristics.

## Glossary

- **Webhook Endpoint**: A customer-registered HTTPS URL, associated with a set of subscribed event types, an HMAC secret, and optional metadata (description, active status).
- **Event**: A business domain occurrence (e.g. `order.completed`) that the platform captures and fans out to all subscribed webhook endpoints.
- **WebhookDelivery**: A single delivery task representing one event being sent to one endpoint; may span multiple HTTP attempts.
- **WebhookAttempt**: One HTTP POST request made to an endpoint URL within a `WebhookDelivery`; records the HTTP status code, response body (up to 1 KB), request latency, and outcome.
- **HMAC Signature**: A `X-Webhook-Signature` request header value computed as `sha256=` + `HMAC-SHA256(secret, rawRequestBody)` in hex, matching the pattern used by GitHub, Stripe, and Shopify.
- **Signing Secret**: A per-endpoint high-entropy secret (32 random bytes, base64url-encoded) used as the HMAC key; surfaced once at endpoint creation and never returned again.
- **Delivery Queue**: A BullMQ queue (`webhook-deliveries`) that holds one job per `WebhookDelivery`; workers pop jobs from this queue and make the HTTP POST call.
- **Dead-Letter Queue (DLQ)**: A secondary queue (`webhook-deliveries:dlq`) for deliveries that have failed all retry attempts; entries can be replayed or discarded by operators.
- **Replay**: Re-enqueuing a DLQ delivery as a new `WebhookDelivery` with `attemptsMade` reset to 0, preserving the original payload and event type.
- **Exponential Backoff**: Retry delay strategy for failed HTTP deliveries: `delay(n) = min(baseDelay × 2^(n-1) + jitter, maxDelay)`.
- **Delivery Status**: The current state of a `WebhookDelivery`: `pending`, `succeeded`, `failed`, `dead-lettered`, or `replayed`.

## Out of Scope

- Inbound webhook ingestion (this system handles outbound delivery only).
- Subscription-based fan-out routing at the message broker level (Kafka, SNS); event ingestion is handled upstream and passed to the `EventRouter`.
- Webhook endpoint URL validation beyond confirming it parses as an HTTPS URL (e.g. DNS resolution probing at registration time).
- Per-endpoint custom retry policies beyond the global default.
- Webhook payload transformation or templating.
- Customer-facing delivery dashboards; delivery status is exposed via a REST API consumed by the platform's own UI.

## Requirements

### Requirement 1: Webhook Endpoint Registration

**User Story:** As a customer, I want to register an HTTPS endpoint URL with the event types I care about, so that my system receives real-time notifications whenever those events occur.

#### Acceptance Criteria

1. WHEN a POST request is made to `/webhooks/endpoints` with a valid `url` (HTTPS scheme, max 2 048 chars), a non-empty `events` array of recognised event type strings, and an optional `description` (max 255 chars) THE SYSTEM SHALL create a new `WebhookEndpoint` record, generate a 32-byte cryptographically random `signingSecret` encoded in base64url, store only a SHA-256 hash of the secret in the database, return the full plaintext secret exactly once in the response as `signingSecret`, and return HTTP 201.
2. IF the `url` does not begin with `https://` THEN THE SYSTEM SHALL return HTTP 400 with body `{ "error": "INSECURE_URL", "message": "Webhook endpoints must use HTTPS." }` and SHALL NOT create any record.
3. IF the `events` array contains any unrecognised event type string THEN THE SYSTEM SHALL return HTTP 400 with body `{ "error": "INVALID_EVENT_TYPE", "invalidTypes": ["<type>"] }` and SHALL NOT create any record.
4. WHEN a new endpoint is created THE SYSTEM SHALL set its `active` field to `true`, assign a UUID v4 `id`, record `createdAt` as the current UTC timestamp, and allow up to 20 active endpoints per customer.
5. IF a customer already has 20 active webhook endpoints THEN THE SYSTEM SHALL return HTTP 422 with body `{ "error": "ENDPOINT_LIMIT_REACHED", "limit": 20 }` and SHALL NOT create a new endpoint.
6. WHEN `GET /webhooks/endpoints` is called THE SYSTEM SHALL return a paginated list of the caller's endpoints including `id`, `url`, `events`, `description`, `active`, `createdAt`, and `lastDeliveryAt`; the `signingSecret` SHALL NOT appear in any list or get response.

### Requirement 2: Event Capture and Queued Delivery

**User Story:** As a platform engineer, I want incoming business events to be fanned out to all matching registered endpoints via a durable queue, so that webhook delivery is decoupled from the critical request path.

#### Acceptance Criteria

1. WHEN `EventRouter.dispatch(eventType, payload)` is called THE SYSTEM SHALL query all `active = true` endpoints whose `events` array contains `eventType`, create one `WebhookDelivery` record per matching endpoint with status `pending`, enqueue one BullMQ job per delivery to the `webhook-deliveries` queue, and return without waiting for delivery outcomes.
2. WHEN a delivery job is enqueued THE SYSTEM SHALL assign a unique `deliveryId` (UUID v4), record `eventType`, `endpointId`, `payload` (serialised JSON, max 512 KB), and `enqueuedAt`; the `deliveryId` is the BullMQ job ID.
3. IF `EventRouter.dispatch()` is called with an event type for which zero active endpoints are subscribed THE SYSTEM SHALL return silently without creating any delivery records or enqueuing any jobs.
4. WHEN a delivery worker picks up a job THE SYSTEM SHALL make an HTTP POST to the endpoint's `url` with a `Content-Type: application/json` body containing `{ "id": "<deliveryId>", "type": "<eventType>", "createdAt": "<ISO8601>", "data": <payload> }`, and record the attempt in `WebhookAttempt`.
5. WHERE an endpoint's `url` host is unreachable or times out (default `requestTimeoutMs: 10 000`) THE SYSTEM SHALL treat the attempt as failed and proceed with the retry schedule, recording `timedOut: true` in the `WebhookAttempt` record.
6. WHEN a delivery attempt receives any HTTP 2xx response code from the customer endpoint THE SYSTEM SHALL mark the `WebhookDelivery` status as `succeeded` and record `succeededAt`; any non-2xx response or network error SHALL be treated as a failed attempt.

### Requirement 3: HMAC-SHA256 Signature Signing

**User Story:** As a customer, I want every webhook HTTP request signed with an HMAC-SHA256 signature so that my server can verify the payload originated from the platform and was not tampered with.

#### Acceptance Criteria

1. WHEN the delivery worker dispatches an HTTP POST to a customer endpoint THE SYSTEM SHALL compute `signature = 'sha256=' + HMAC-SHA256(signingSecret, rawBody).hex()` and include it in the request as header `X-Webhook-Signature: <signature>`, where `rawBody` is the exact UTF-8 byte sequence of the serialised JSON body.
2. WHEN the delivery worker dispatches an HTTP POST THE SYSTEM SHALL also include headers `X-Webhook-Delivery-Id: <deliveryId>`, `X-Webhook-Event: <eventType>`, and `X-Webhook-Timestamp: <unix-epoch-seconds>` on every request.
3. WHERE the `signingSecret` is used to compute the signature THE SYSTEM SHALL retrieve the plaintext secret from a secure store (e.g. AWS Secrets Manager or an encrypted column); the plaintext secret SHALL NOT be stored in the `webhook_endpoints` table, in any log line, or in any queue payload.
4. WHEN a new endpoint is created THE SYSTEM SHALL use `crypto.randomBytes(32)` to generate the secret, encode it as base64url, return it once in the `POST /webhooks/endpoints` response, and thereafter only store and use the secret for HMAC computation without surfacing it again via any API.
5. WHEN `POST /webhooks/endpoints/:id/rotate-secret` is called THE SYSTEM SHALL generate a new signing secret, store it alongside the old secret for a `rotationGracePeriodSeconds` (default 300 s), and during that window sign outbound requests with both secrets so that customer servers can accept either signature while updating their configuration; after the grace period THE SYSTEM SHALL retire the old secret.

### Requirement 4: Retry with Exponential Backoff

**User Story:** As a platform engineer, I want failed deliveries to be retried automatically with exponential backoff and jitter, so that transient customer endpoint outages resolve without operator intervention.

#### Acceptance Criteria

1. WHEN a delivery attempt fails (non-2xx response, timeout, or connection error) and `attemptsMade < maxAttempts` (default 6) THE SYSTEM SHALL schedule a retry with delay `min(baseDelay × 2^(attemptsMade - 1) + jitter, maxDelay)` where `baseDelay` defaults to 5 000 ms, `jitter` is a uniform random integer in `[0, baseDelay]` ms, and `maxDelay` defaults to 3 600 000 ms (1 hour).
2. WHEN a delivery is awaiting its next retry THE SYSTEM SHALL set the `WebhookDelivery` status to `pending` and record `nextAttemptAt` as the earliest retry timestamp; the delivery worker SHALL NOT pick up the job before that time.
3. WHERE a customer endpoint returns HTTP 429 (Too Many Requests) with a `Retry-After` header THE SYSTEM SHALL use the greater of the `Retry-After` value (in seconds) and the computed exponential backoff delay as the next retry interval.
4. WHERE a customer endpoint returns HTTP 410 (Gone) THE SYSTEM SHALL treat this as a permanent failure signal, skip all remaining retries, mark the delivery as `failed` with `permanentFailure: true`, and automatically set the endpoint's `active` field to `false` to stop future deliveries to that URL.
5. WHEN a delivery is successfully delivered after one or more retries THE SYSTEM SHALL record `attemptsMade` (total including failed attempts), `succeededAt`, and the successful attempt's HTTP status code and response body in the delivery log.
6. IF a delivery attempt throws an unhandled exception in the worker process (e.g. ENOMEM, Node.js crash) THEN THE SYSTEM SHALL rely on BullMQ's stall checker to re-queue the delivery job within `stalledInterval` seconds for another worker to attempt, maintaining at-least-once delivery semantics.

### Requirement 5: Dead-Letter Queue After N Failures

**User Story:** As a platform operator, I want deliveries that exhaust all retry attempts moved to a DLQ with full context, so that I can diagnose the root cause, notify the customer, and replay deliveries after the endpoint is fixed.

#### Acceptance Criteria

1. WHEN a `WebhookDelivery`'s `attemptsMade` reaches `maxAttempts` after a final failure THE SYSTEM SHALL atomically move the delivery job to the `webhook-deliveries:dlq` queue, set the `WebhookDelivery` status to `dead-lettered`, record `deadLetteredAt`, and preserve all `WebhookAttempt` records for diagnostic inspection.
2. WHEN a delivery is dead-lettered THE SYSTEM SHALL emit a `webhook.dead_lettered` event containing `deliveryId`, `endpointId`, `eventType`, `attemptsMade`, and `deadLetteredAt`; consumers of this event may notify the customer via email or update an endpoint health metric.
3. WHEN `GET /webhooks/deliveries?status=dead-lettered&endpointId=` is called THE SYSTEM SHALL return a paginated list of matching `WebhookDelivery` records ordered by `deadLetteredAt DESC`; `pageSize` defaults to 20 and is capped at 100.
4. WHEN `POST /webhooks/deliveries/:deliveryId/replay` is called THE SYSTEM SHALL re-enqueue the delivery as a new job with `attemptsMade` reset to 0 but preserving the original `payload`, `eventType`, `endpointId`, and `deliveryId` (as the source reference); a new `replayDeliveryId` SHALL be assigned and returned.
5. IF `POST /webhooks/deliveries/:deliveryId/replay` is called and the target endpoint's `active` field is `false` THE SYSTEM SHALL return HTTP 409 with body `{ "error": "ENDPOINT_INACTIVE", "endpointId": "<id>" }` and SHALL NOT enqueue a new delivery job.
6. WHILE a `WebhookDelivery` is dead-lettered THE SYSTEM SHALL retain all its `WebhookAttempt` records for at least 30 days before any clean-up policy removes them.

### Requirement 6: Delivery Logs and Status

**User Story:** As a customer support engineer, I want to query the delivery history for any event or endpoint, including each HTTP attempt's status code, response body, and duration, so that I can diagnose customer-reported missed webhooks.

#### Acceptance Criteria

1. WHEN `GET /webhooks/deliveries/:deliveryId` is called THE SYSTEM SHALL return a `WebhookDelivery` record containing `deliveryId`, `endpointId`, `eventType`, `payload`, `status`, `attemptsMade`, `maxAttempts`, `enqueuedAt`, `nextAttemptAt`, `succeededAt`, `deadLetteredAt`, and an `attempts` array of `WebhookAttempt` records.
2. WHEN `GET /webhooks/deliveries` is called with optional query params `?endpointId=&eventType=&status=&from=&to=&page=&pageSize=` THE SYSTEM SHALL return a paginated list of `WebhookDelivery` records matching all supplied filters; `pageSize` defaults to 20 and is capped at 100; results are ordered by `enqueuedAt DESC`.
3. WHERE a `WebhookAttempt` record is created for each delivery attempt THE SYSTEM SHALL record: `attemptNumber` (1-indexed), `requestedAt` (UTC), `httpStatusCode` (or null on connection error), `responseBody` (first 1 024 bytes of the response; null on timeout/connection error), `durationMs` (time from request start to response headers received), `timedOut` (boolean), and `errorMessage` (null on success).
4. IF a `deliveryId` does not exist in the database THEN THE SYSTEM SHALL return HTTP 404 with body `{ "error": "DELIVERY_NOT_FOUND", "deliveryId": "<id>" }`.
5. WHEN `GET /webhooks/endpoints/:endpointId/stats` is called THE SYSTEM SHALL return aggregated delivery statistics for the past 7 days: `totalDeliveries`, `succeeded`, `failed`, `deadLettered`, `successRate` (percentage), and `averageLatencyMs`.
6. WHEN a `WebhookDelivery` transitions to `succeeded` or `dead-lettered` THE SYSTEM SHALL update the parent endpoint's `lastDeliveryAt` timestamp and `lastDeliveryStatus` field asynchronously.

### Requirement 7: Replay Endpoint and Verifying-Endpoint Guidance

**User Story:** As a customer developer, I want clear guidance on how to verify incoming webhook signatures in my own server, so that I can securely confirm each request came from the platform and build confidence before going to production.

#### Acceptance Criteria

1. WHEN `POST /webhooks/endpoints/:id/test` is called by the endpoint owner THE SYSTEM SHALL enqueue a synthetic delivery with `eventType: "webhook.test"` and a fixed test payload `{ "source": "kiro-kit/webhook-test" }` to the registered URL, allowing the customer to confirm receipt and signature verification without waiting for a real event.
2. WHERE the platform documentation describes signature verification THE SYSTEM SHALL provide a working reference implementation in TypeScript showing: (a) reading the raw request body as a `Buffer`; (b) computing `HMAC-SHA256(secret, body)` using `crypto.createHmac`; (c) comparing with `X-Webhook-Signature` using `crypto.timingSafeEqual` to prevent timing attacks; (d) rejecting requests where `X-Webhook-Timestamp` is more than 300 seconds old to prevent replay attacks.
3. IF a customer calls `POST /webhooks/endpoints/:id/test` and the endpoint responds within 10 seconds with any HTTP 2xx status THE SYSTEM SHALL return `{ "status": "reachable", "httpStatusCode": <n>, "latencyMs": <n> }` in the API response.
4. IF the test delivery times out or receives a non-2xx response THE SYSTEM SHALL return `{ "status": "unreachable", "error": "<description>" }` and increment the attempt count on the synthetic `WebhookDelivery` record without scheduling any retries (the test delivery is fire-and-forget).
5. WHEN `GET /webhooks/events` is called THE SYSTEM SHALL return the complete catalogue of recognised event type strings, each with a `name`, `description`, and a representative `examplePayload` so that customers can configure subscriptions and write verification code without consulting external documentation.
6. WHERE a customer requests to verify both old and new secrets during a rotation grace period THE SYSTEM SHALL document that their verification code should try `X-Webhook-Signature` against the current secret and, if that fails, against the previous secret before rejecting the request.

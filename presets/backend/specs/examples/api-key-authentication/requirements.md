# Requirements Document

## Introduction

This document defines the requirements for a rate-limited API key authentication system for a REST API. The system enables consumer applications to authenticate programmatically using opaque API keys, each carrying scoped permissions and subject to configurable rate limits enforced by a token bucket algorithm. It is designed for multi-tenant SaaS products that need controlled, auditable access to their public API surface.

## Glossary

- **API Key**: A unique, opaque credential string issued to a client application that proves identity when included in HTTP requests.
- **Key Hash**: A SHA-256 hex digest of the raw API key stored in the database; the plaintext key is surfaced exactly once at issuance and never again.
- **Key Prefix**: The first 8 characters of the raw API key (e.g. `kk_live_a`), stored non-secret in the database to let users visually identify keys in list responses.
- **Scope**: A named permission token (e.g. `read:orders`, `write:products`) attached to an API key that restricts which endpoints the key may access.
- **Token Bucket**: A rate-limiting algorithm that grants each API key a refillable bucket of request tokens; requests that exhaust the bucket are rejected until tokens replenish at a continuous rate.
- **Rate Limit Window**: The rolling time interval (e.g. 60 seconds) over which the token bucket fully refills from empty.
- **Key Rotation**: The process of issuing a replacement API key and invalidating the prior one, with an optional grace period during which both the old and new key are simultaneously accepted.
- **Audit Log**: An append-only record of authentication events (success, failure, rate-limited) and key lifecycle events (created, revoked, rotated), associated with a specific key ID and caller context.
- **RateLimit-* Headers**: Standard HTTP response headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`) that communicate rate-limit state to the caller on every response from a protected endpoint.

## Requirements

### Requirement 1: API Key Issuance

**User Story:** As an API consumer, I want to create named API keys with specific scopes and optional expiry, so that my application can authenticate against the REST API without using my master credentials.

#### Acceptance Criteria

1. WHEN a POST request is made to `/v1/api-keys` with a valid `name` (string, 1–100 chars) and `scopes` (non-empty array of recognised scope strings) THE SYSTEM SHALL generate a cryptographically random 32-byte key, prefix it with `kk_live_`, return it exactly once in the response body as the `key` field, and store only its SHA-256 hex-encoded hash in the database.
2. WHEN a new API key is issued THE SYSTEM SHALL assign it a unique UUID v4, set its `status` to `active`, record the authenticated user ID as `ownerId`, record `createdAt` as the current UTC timestamp, and store the first 8 characters of the raw key as `keyPrefix`.
3. IF the `scopes` array contains any unrecognised scope identifier THEN THE SYSTEM SHALL return HTTP 400 with body `{ "error": "INVALID_SCOPE", "invalidScopes": ["<scope>"] }` and SHALL NOT persist any key.
4. IF the authenticated user already has 50 or more active API keys THEN THE SYSTEM SHALL return HTTP 422 with body `{ "error": "KEY_LIMIT_REACHED", "limit": 50 }` and SHALL NOT persist any key.
5. WHERE an `expiresIn` ISO 8601 duration string is included in the request THE SYSTEM SHALL compute `expiresAt = createdAt + expiresIn` and store it; otherwise `expiresAt` SHALL be null, meaning the key never expires unless explicitly revoked.
6. WHERE the `rateLimit` object is omitted from the request THE SYSTEM SHALL apply the tenant-level default rate limit configuration (`capacity: 1000`, `windowSeconds: 60`) to the new key.

### Requirement 2: API Key Revocation

**User Story:** As an API consumer, I want to revoke API keys immediately or rotate them with a grace period, so that I can remove access for compromised or decommissioned clients without disrupting traffic mid-migration.

#### Acceptance Criteria

1. WHEN a DELETE request is made to `/v1/api-keys/:keyId` and the key belongs to the authenticated user THE SYSTEM SHALL set the key's `status` to `revoked`, record `revokedAt` as the current UTC timestamp, and return HTTP 204 with no body.
2. WHEN a DELETE request is made to `/v1/api-keys/:keyId` and the key does not exist or belongs to a different user THE SYSTEM SHALL return HTTP 404 with body `{ "error": "KEY_NOT_FOUND" }` without disclosing whether the key exists under another owner.
3. WHEN a key is revoked THE SYSTEM SHALL reject all subsequent authentication attempts using that key within 5 seconds of revocation, regardless of any in-process cache TTL still holding a resolved key record.
4. IF an API key's `expiresAt` timestamp is in the past THE SYSTEM SHALL treat the key as equivalent to a revoked key and return HTTP 401 with body `{ "error": "KEY_EXPIRED" }` on any authentication attempt.
5. WHILE a key's `status` is `revoked` or `expired` THE SYSTEM SHALL continue to return its metadata (excluding the hash and raw key) via GET `/v1/api-keys/:keyId` so that operators can audit decommissioned credentials.
6. WHEN a POST request is made to `/v1/api-keys/:keyId/rotate` with a `gracePeriodSeconds` value between 1 and 3600 THE SYSTEM SHALL issue a new replacement key, mark the old key as `rotating`, and continue accepting the old key until the grace period elapses, after which it SHALL revoke the old key automatically.

### Requirement 3: Secure Key Storage

**User Story:** As a security engineer, I want API keys to be stored only as one-way hashes, so that a database breach cannot yield usable credentials.

#### Acceptance Criteria

1. WHEN an API key is persisted to the database THE SYSTEM SHALL store only the SHA-256 hex-encoded hash of the raw key in the `key_hash` column and SHALL index that column with a unique B-tree index to support O(log n) constant-time lookup.
2. WHEN the key issuance response is sent THE SYSTEM SHALL include the plaintext raw key in the `key` field exactly once and SHALL NOT store, log, trace, or emit the plaintext key in any application log line, HTTP request/response log, or distributed trace attribute.
3. IF the same raw key value is submitted in multiple sequential authentication requests THE SYSTEM SHALL reproduce the same SHA-256 hash on each request and locate the matching record without leaking key validity through differential response timing.
4. WHERE the `api_keys` table stores key records THE SYSTEM SHALL also store a non-secret `key_prefix` column containing the first 8 characters of the raw key so that users can visually match keys in list responses without the database holding any recoverable secret beyond the hash.
5. WHILE the system is experiencing a database outage or connection error during an authentication attempt THE SYSTEM SHALL reject the request with HTTP 503 rather than falling back to any plaintext comparison, insecure secondary store, or stale in-memory cache entry that bypasses hash validation.

### Requirement 4: Scope-Based Authorization

**User Story:** As an API product manager, I want each API key to carry a specific set of permission scopes that restrict which endpoints it can call, so that a compromised key has a bounded blast radius.

#### Acceptance Criteria

1. WHEN an authenticated request reaches a protected endpoint THE SYSTEM SHALL verify that the API key's `scopes` array contains all scope strings declared as required by that endpoint before delegating to the route handler.
2. IF the API key's scopes do not satisfy the endpoint's required scopes THEN THE SYSTEM SHALL return HTTP 403 with body `{ "error": "INSUFFICIENT_SCOPE", "required": ["<scope>"], "provided": ["<scope>"] }` and SHALL NOT invoke the route handler for that request.
3. WHERE an endpoint is declared as requiring the `write:*` wildcard scope THE SYSTEM SHALL accept any key whose `scopes` array contains either the literal `write:*` or the resource-specific write scope for that endpoint (e.g. `write:orders`).
4. WHEN the scope set for an existing active key is updated via PUT `/v1/api-keys/:keyId/scopes` THE SYSTEM SHALL enforce the new scope set on all subsequent authenticated requests within 30 seconds of the update.
5. IF a POST `/v1/api-keys` request specifies a scope that the authenticated user's own session does not include THEN THE SYSTEM SHALL return HTTP 403 with body `{ "error": "SCOPE_ELEVATION_DENIED", "deniedScopes": ["<scope>"] }` and SHALL NOT create the key.

### Requirement 5: Per-Key Rate Limiting

**User Story:** As a platform operator, I want each API key to be subject to its own independently enforced request rate limit using a token bucket algorithm, so that a single high-traffic client cannot degrade the API for all other consumers.

#### Acceptance Criteria

1. WHEN a request authenticated with a valid, active API key arrives at a protected endpoint THE SYSTEM SHALL atomically deduct one token from that key's bucket in Redis before forwarding the request; if the bucket holds at least one token, the deduction SHALL succeed and the request SHALL proceed.
2. WHEN a request is rejected because the key's token bucket is empty THE SYSTEM SHALL return HTTP 429 with response headers `RateLimit-Limit: <capacity>`, `RateLimit-Remaining: 0`, `RateLimit-Reset: <unix-epoch-seconds>`, and `Retry-After: <seconds-until-next-token>`, and body `{ "error": "RATE_LIMIT_EXCEEDED", "retryAfter": <seconds> }`.
3. WHILE a request is proceeding after a successful token deduction THE SYSTEM SHALL include response headers `RateLimit-Limit: <capacity>`, `RateLimit-Remaining: <tokens-remaining-after-deduction>`, and `RateLimit-Reset: <unix-epoch-seconds>` on every protected-endpoint response regardless of the HTTP status code produced by the business-logic handler.
4. WHEN tokens are replenished THE SYSTEM SHALL use a continuous refill model that adds `capacity / windowSeconds` tokens per second (fractional), capped at `capacity`, so that brief idle periods recover tokens proportionally rather than waiting for a fixed window boundary.
5. IF the API key has a custom `rateLimit` configuration stored on the key record THE SYSTEM SHALL use that key's `{ capacity, windowSeconds }` values in preference to the tenant-level defaults.
6. WHERE rate-limit state is stored in Redis THE SYSTEM SHALL execute the token deduction and refill calculation inside a single Lua script evaluated atomically on the Redis server to prevent race conditions under concurrent requests from the same key.

### Requirement 6: Authentication Middleware

**User Story:** As a backend developer, I want a reusable authentication middleware that validates API keys on every protected route and attaches the resolved key context, so that individual route handlers never need to implement their own auth or rate-limit logic.

#### Acceptance Criteria

1. WHEN a protected endpoint receives a request with an `Authorization: Bearer <token>` header whose token resolves to an active API key THE SYSTEM SHALL attach an `ApiKeyContext` object to the request containing `keyId`, `ownerId`, `scopes`, and `rateLimitConfig`, and SHALL invoke the next handler in the pipeline.
2. IF a protected endpoint receives a request with no `Authorization` header, or with an `Authorization` header that does not use the `Bearer` scheme THEN THE SYSTEM SHALL return HTTP 401 with response header `WWW-Authenticate: Bearer realm="api"` and body `{ "error": "MISSING_CREDENTIALS" }` without invoking the route handler.
3. IF the bearer token does not match any active API key hash in the database THEN THE SYSTEM SHALL return HTTP 401 with body `{ "error": "INVALID_API_KEY" }` and SHALL complete the hash lookup and comparison in constant time to prevent timing-oracle attacks that could enumerate valid key prefixes.
4. WHERE the middleware resolves an API key and checks its rate limit THE SYSTEM SHALL complete the full authentication pipeline (hash computation + database lookup + Redis token check) within 20 milliseconds at the 95th percentile under normal operating load.
5. WHILE the middleware is processing or logging any request THE SYSTEM SHALL NOT emit the raw bearer token value in any structured log field, trace attribute, error message, or metric label; it SHALL reference the resolved key only by its `keyId` UUID.

### Requirement 7: Audit Logging

**User Story:** As a compliance officer, I want every API key authentication event and key lifecycle change logged to an immutable append-only audit trail, so that I can investigate security incidents and satisfy regulatory audit requirements.

#### Acceptance Criteria

1. WHEN any authentication attempt is processed by the middleware THE SYSTEM SHALL emit an audit log entry containing: `eventType` (one of `auth.success`, `auth.failure`, `auth.rate_limited`), `keyId` (or `null` if the token was entirely unrecognised), `ownerId`, `ipAddress`, `userAgent`, `endpoint` (HTTP method + path pattern, e.g. `POST /v1/orders`), `statusCode`, and `timestamp` (ISO 8601 UTC).
2. WHEN an API key is created, revoked, or rotated via the key management endpoints THE SYSTEM SHALL emit a lifecycle audit log entry containing `eventType` (one of `key.created`, `key.revoked`, `key.rotated`), `keyId`, `actorId` (the authenticated user performing the action), `scopes`, and `timestamp`.
3. IF audit log storage is temporarily unavailable when an entry is emitted THE SYSTEM SHALL still complete the API request, SHALL retry the audit write up to 3 times with exponential backoff, and SHALL increment the `audit_log_dropped_total` counter metric after all retries are exhausted rather than blocking the request path.
4. WHERE audit log entries are stored THE SYSTEM SHALL write them exclusively to the `api_key_audit_log` table which has no UPDATE or DELETE permissions granted to the application database role, making rows effectively append-only.
5. WHILE querying audit logs via GET `/v1/api-keys/:keyId/audit` THE SYSTEM SHALL support filtering by `eventType`, `from` (ISO 8601 start time), and `to` (ISO 8601 end time), and SHALL paginate results with a default page size of 50 entries and a maximum page size of 200 entries per request.

# Implementation Plan: API Key Authentication

## Overview

This plan builds rate-limited API key authentication incrementally, starting from the database foundation and working upward through utilities, services, middleware, and HTTP endpoints. Each numbered task is independently completable; tasks with a higher number depend on the outputs of lower-numbered tasks. The order enforces the invariant that no layer is written before the layer it depends on exists.

Tasks marked `*` include automated tests as part of their definition of done. Traceability references at the end of each top-level task point to specific requirement acceptance criteria in `requirements.md`.

## Tasks

- [ ] 1. Database Migrations
  - [ ] 1.1 Write migration: create `api_keys` table with columns `id` (UUID PK), `name` (TEXT NOT NULL), `key_hash` (CHAR(64) NOT NULL), `key_prefix` (CHAR(8) NOT NULL), `owner_id` (UUID NOT NULL), `scopes` (TEXT[] NOT NULL DEFAULT '{}'), `status` (TEXT NOT NULL DEFAULT 'active'), `rate_limit` (JSONB NOT NULL), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `expires_at` (TIMESTAMPTZ), `revoked_at` (TIMESTAMPTZ), `last_used_at` (TIMESTAMPTZ)
  - [ ] 1.2 Add unique B-tree index `idx_api_keys_key_hash` on `api_keys(key_hash)`
  - [ ] 1.3 Add composite index `idx_api_keys_owner_status` on `api_keys(owner_id, status)` to cover paginated list queries
  - [ ] 1.4 Write migration: create `api_key_audit_log` table with columns `id` (UUID PK), `event_type` (TEXT NOT NULL), `key_id` (UUID nullable), `owner_id` (UUID nullable), `actor_id` (UUID nullable), `ip_address` (INET NOT NULL), `user_agent` (TEXT), `endpoint` (TEXT), `status_code` (SMALLINT), `metadata` (JSONB NOT NULL DEFAULT '{}'), `timestamp` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  - [ ] 1.5 Add index `idx_audit_key_time` on `api_key_audit_log(key_id, timestamp DESC)`
  - [ ] 1.6 Grant INSERT and SELECT only on `api_key_audit_log` to the application database role; assert no UPDATE or DELETE privilege exists
  - [ ] 1.7* Write migration smoke tests: assert both tables exist, all indexes are present, the `key_hash` unique constraint fires on duplicate insert, and the application role cannot DELETE from `api_key_audit_log`
  - _Requirements: R3.1, R3.4, R7.4_

- [ ] 2. Key Generation and Hashing Utilities
  - [ ] 2.1 Implement `generateRawKey(): string` — returns `'kk_live_' + base62Encode(crypto.randomBytes(32))`
  - [ ] 2.2 Implement `hashKey(rawKey: string): string` — returns `crypto.createHash('sha256').update(rawKey).digest('hex')`
  - [ ] 2.3 Implement `extractKeyPrefix(rawKey: string): string` — returns the first 8 characters of the raw key
  - [ ] 2.4* Write unit tests: assert generated key matches `/^kk_live_[A-Za-z0-9]{43,}$/`, assert `hashKey` is deterministic across calls, assert `extractKeyPrefix` always returns exactly 8 characters, assert 100,000 generated keys produce no SHA-256 collisions
  - _Requirements: R1.1, R3.1, R3.2, R3.3, R3.4_

- [ ] 3. Scope Registry and Validation
  - [ ] 3.1 Define `SCOPE_CATALOGUE` as a readonly record mapping each scope string to a `ScopeDefinition` (name, description, resource, action)
  - [ ] 3.2 Implement `validateScopes(requested: string[]): { valid: boolean; invalidScopes: string[] }` — checks each entry against `SCOPE_CATALOGUE`
  - [ ] 3.3 Implement `checkScopeElevation(requestedScopes: string[], callerScopes: string[]): string[]` — returns any scope in `requestedScopes` not covered by `callerScopes` or a wildcard
  - [ ] 3.4 Implement `scopesSatisfy(keyScopes: string[], required: string[]): boolean` — returns true if every required scope is either present literally in `keyScopes` or covered by `write:*` when the required scope starts with `write:`
  - [ ] 3.5* Write unit tests: valid scope array passes, array with one unknown scope returns that scope in `invalidScopes`, `write:*` satisfies `write:orders` and `write:products`, `read:orders` does not satisfy `write:orders`, elevation check returns denied scopes when caller lacks them
  - _Requirements: R1.3, R4.1, R4.2, R4.3, R4.5_

- [ ] 4. ApiKey Repository
  - [ ] 4.1 Implement `ApiKeyRepository.create(data: CreateApiKeyData): Promise<ApiKey>` — INSERT row, return full record
  - [ ] 4.2 Implement `ApiKeyRepository.findByHash(keyHash: string): Promise<ApiKey | null>` — SELECT by `key_hash` index; return null if no row matches
  - [ ] 4.3 Implement `ApiKeyRepository.findById(keyId: string, ownerId: string): Promise<ApiKey | null>` — SELECT with both `id` and `owner_id` filters to prevent cross-owner access
  - [ ] 4.4 Implement `ApiKeyRepository.listByOwner(ownerId: string, opts: { page, pageSize, status? }): Promise<{ data: ApiKeyMetadata[]; total: number }>` — paginated SELECT; never return `key_hash` in the metadata projection
  - [ ] 4.5 Implement `ApiKeyRepository.revoke(keyId: string, ownerId: string): Promise<boolean>` — UPDATE `status = 'revoked'`, `revoked_at = NOW()` WHERE `id = $1 AND owner_id = $2`; return false if no row was updated
  - [ ] 4.6 Implement `ApiKeyRepository.updateScopes(keyId: string, ownerId: string, scopes: string[]): Promise<ApiKey | null>` — UPDATE `scopes = $3` WHERE `id = $1 AND owner_id = $2 AND status = 'active'`
  - [ ] 4.7 Implement `ApiKeyRepository.countActiveByOwner(ownerId: string): Promise<number>` — SELECT COUNT(*) WHERE `owner_id = $1 AND status = 'active'`
  - [ ] 4.8 Implement `ApiKeyRepository.touchLastUsed(keyId: string): void` — fire-and-forget UPDATE `last_used_at = NOW()`; swallow errors silently (non-blocking)
  - [ ] 4.9* Write repository integration tests against Docker PostgreSQL: assert `findByHash` returns correct row after `create`, assert `findById` returns null for mismatched `ownerId`, assert `revoke` sets `revoked_at`, assert `countActiveByOwner` excludes revoked rows, assert `listByOwner` never exposes `key_hash`
  - _Requirements: R1.1, R1.2, R2.1, R2.2, R2.5, R3.1, R3.4_

- [ ] 5. Rate Limit Service
  - [ ] 5.1 Write `src/auth/lua/token_bucket.lua` implementing continuous refill: load `{tokens, lastRefill}` from Redis Hash, compute refill based on elapsed seconds, deduct 1 if `tokens >= 1`, store updated state, set TTL to `windowSeconds * 2`, return `{allowed (0|1), floor(tokens), resetAt}`
  - [ ] 5.2 Implement `RateLimitService.consumeToken(keyId: string, config: RateLimitConfig): Promise<ConsumeResult>` — load the Lua script at startup, call `client.eval(script, 1, key, capacity, window, Date.now()/1000)`, return `{ allowed: boolean; remaining: number; resetAt: number }`
  - [ ] 5.3 Implement circuit breaker in `RateLimitService`: track consecutive Redis errors; after 5 errors within a 10-second window, set `degraded = true`, emit `rate_limit_degraded` Prometheus gauge to 1, return `{ allowed: true, remaining: -1, resetAt: 0 }` without calling Redis; reset on next successful PING
  - [ ] 5.4* Write unit tests using `ioredis-mock`: assert token deducted on first call, assert `remaining` decrements by 1 per call, assert `allowed = false` when starting with 0 tokens, assert refill adds fractional tokens proportional to elapsed time, assert bucket capped at `capacity`, assert `resetAt` is a future unix timestamp
  - [ ] 5.5* Write integration tests against Docker Redis: send `capacity + 1` concurrent requests for the same key using `Promise.all`; assert exactly 1 returns `allowed = false`; assert `remaining` never goes negative; assert Redis key has correct TTL
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6_

- [ ] 6. Audit Service
  - [ ] 6.1 Define `AuditEvent` type union covering all 7 event types (`auth.success`, `auth.failure`, `auth.rate_limited`, `key.created`, `key.revoked`, `key.rotated`) with required fields per event type
  - [ ] 6.2 Implement `AuditService.emit(event: AuditEvent): void` — push event to an in-process queue (e.g. BullMQ); return immediately without awaiting the INSERT
  - [ ] 6.3 Implement the queue worker: INSERT one row into `api_key_audit_log` per event; on INSERT failure, retry up to 3 times with exponential backoff (1 s, 2 s, 4 s)
  - [ ] 6.4 After all 3 retries are exhausted, increment the `audit_log_dropped_total` Prometheus counter and discard the event; do not throw or crash the process
  - [ ] 6.5 Implement `AuditService.query(keyId: string, filters: AuditQueryFilters, pagination: Pagination): Promise<AuditLogResponse>` — SELECT from `api_key_audit_log` with optional `event_type`, `timestamp >= from`, and `timestamp <= to` filters; apply LIMIT/OFFSET pagination
  - [ ] 6.6* Write unit tests: assert `emit` returns synchronously, assert correct `event_type` written for each auth outcome, assert `audit_log_dropped_total` increments exactly once after 3 consecutive INSERT failures, assert `query` applies date filters correctly
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5_

- [ ] 7. ApiKey Service (Business Logic)
  - [ ] 7.1 Implement `ApiKeyService.issueKey(ownerId: string, request: CreateApiKeyRequest): Promise<CreateApiKeyResponse>` — call `validateScopes`, check `countActiveByOwner < 50`, call `checkScopeElevation`, call `generateRawKey`, compute hash and prefix, call `repository.create`, emit `key.created` audit event, return response including the raw key
  - [ ] 7.2 Implement `ApiKeyService.revokeKey(keyId: string, ownerId: string): Promise<void>` — call `repository.revoke`; if it returns false throw `KeyNotFoundError`; write a `revoked:{keyId}` sentinel key to Redis with 10 s TTL; emit `key.revoked` audit event
  - [ ] 7.3 Implement `ApiKeyService.rotateKey(keyId: string, ownerId: string, opts: RotateApiKeyRequest): Promise<RotateApiKeyResponse>` — issue a new key via `issueKey`, set old key `status = 'rotating'` if `gracePeriodSeconds > 0` else immediately revoke, schedule a job to revoke the old key after the grace period, emit `key.rotated` audit event
  - [ ] 7.4 Implement `ApiKeyService.updateScopes(keyId: string, ownerId: string, scopes: string[]): Promise<ApiKeyMetadata>` — call `validateScopes`, call `checkScopeElevation`, call `repository.updateScopes`; if null, throw `KeyNotFoundError`; write a `scope_updated:{keyId}` sentinel to Redis to signal cache invalidation
  - [ ] 7.5 Implement `ApiKeyService.getKey(keyId: string, ownerId: string): Promise<ApiKeyMetadata>` — call `repository.findById`; if null, throw `KeyNotFoundError`; return `ApiKeyMetadata` (never include `keyHash` in the returned object)
  - [ ] 7.6 Implement `ApiKeyService.listKeys(ownerId: string, opts: ListOptions): Promise<ListApiKeysResponse>` — delegate to `repository.listByOwner`
  - [ ] 7.7* Write unit tests with mocked repository and Redis: assert `issueKey` throws `KeyLimitReachedError` at count = 50, assert `issueKey` throws `InvalidScopeError` for unknown scope, assert `issueKey` throws `ScopeElevationError` when caller lacks scope, assert `revokeKey` writes Redis sentinel, assert `rotateKey` with `gracePeriodSeconds = 0` immediately sets old key to `revoked`
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R2.1, R2.2, R2.6, R4.4, R4.5_

- [ ] 8. Authentication Middleware
  - [ ] 8.1 Implement `ApiKeyAuthMiddleware`: parse `Authorization` header; if absent or not matching `/^Bearer .+$/i`, return `401 MISSING_CREDENTIALS` with `WWW-Authenticate: Bearer realm="api"` header immediately without touching the database
  - [ ] 8.2 Compute `keyHash = hashKey(token)`; check the in-process LRU cache (max 10,000 entries, TTL 5 s) for a cached `ApiKey`; if not cached, call `repository.findByHash(keyHash)`; if `repository` throws a connection error, return `503 SERVICE_UNAVAILABLE` with `Retry-After: 10`
  - [ ] 8.3 Before serving from the LRU cache, check for `revoked:{keyId}` sentinel in Redis; if the sentinel exists, evict the cache entry and treat the key as revoked (this bounds revocation propagation to ≤ 5 seconds)
  - [ ] 8.4 If `findByHash` returns null, return `401 INVALID_API_KEY` with `WWW-Authenticate` header; if the row has `status = 'revoked'` or `status = 'expired'`, return `401 INVALID_API_KEY`; if `expiresAt < now()`, return `401 KEY_EXPIRED`
  - [ ] 8.5 Call `rateLimitService.consumeToken(key.id, key.rateLimit)`; if `allowed = false`, return `429 RATE_LIMIT_EXCEEDED` with headers `RateLimit-Limit: <capacity>`, `RateLimit-Remaining: 0`, `RateLimit-Reset: <resetAt>`, `Retry-After: <seconds>` and body `{ "error": "RATE_LIMIT_EXCEEDED", "retryAfter": <seconds> }`
  - [ ] 8.6 On successful auth, attach `req.apiKey = { keyId, ownerId, scopes, rateLimit }` to the request object; stage `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers on the response object; call `repository.touchLastUsed(key.id)` fire-and-forget; call `next()`
  - [ ] 8.7 Ensure the middleware never logs the raw bearer token — only log `keyId` in structured fields; configure the logger redaction list to include `authorization` and `key` field names
  - [ ] 8.8* Write unit tests: missing header → 401 with `WWW-Authenticate`, non-Bearer scheme → 401, unknown hash → 401, revoked status → 401, expired key → 401 `KEY_EXPIRED`, empty bucket → 429 with all four rate-limit headers populated, valid active key → `req.apiKey` attached and all `RateLimit-*` headers set on response
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R5.2, R5.3, R3.5_

- [ ] 9. Scope Guard
  - [ ] 9.1 Implement `requireScopes(...scopes: string[])` middleware factory: returns an Express/Fastify middleware function that reads `req.apiKey` and calls `scopesSatisfy(req.apiKey.scopes, required)`
  - [ ] 9.2 If `req.apiKey` is absent (guard applied without auth middleware upstream), return `401 MISSING_CREDENTIALS`
  - [ ] 9.3 If `scopesSatisfy` returns false, return `403 INSUFFICIENT_SCOPE` with body `{ "error": "INSUFFICIENT_SCOPE", "required": [...], "provided": [...] }` without invoking the route handler
  - [ ] 9.4* Write unit tests: exact scope match → passes to next(), `read:orders` fails `write:orders` requirement, `write:*` satisfies `write:products`, missing `req.apiKey` returns 401, scope check failure returns 403 with correct `required` and `provided` arrays
  - _Requirements: R4.1, R4.2, R4.3_

- [ ] 10. Key Management HTTP Endpoints
  - [ ] 10.1 Implement `POST /v1/api-keys`: validate request body with JSON schema (name, scopes required; rateLimit, expiresIn optional); call `ApiKeyService.issueKey`; return 201 with `CreateApiKeyResponse`
  - [ ] 10.2 Implement `GET /v1/api-keys`: validate `page` and `pageSize` query params (defaults 1 and 20, max pageSize 100); call `ApiKeyService.listKeys`; return 200 with `ListApiKeysResponse`
  - [ ] 10.3 Implement `GET /v1/api-keys/:keyId`: call `ApiKeyService.getKey`; return 200 with `ApiKeyMetadata` or 404 `KEY_NOT_FOUND`
  - [ ] 10.4 Implement `DELETE /v1/api-keys/:keyId`: call `ApiKeyService.revokeKey`; return 204 on success, 404 on `KeyNotFoundError`
  - [ ] 10.5 Implement `PUT /v1/api-keys/:keyId/scopes`: validate `scopes` body; call `ApiKeyService.updateScopes`; return 200 with updated `ApiKeyMetadata`
  - [ ] 10.6 Implement `POST /v1/api-keys/:keyId/rotate`: validate optional `gracePeriodSeconds` (0–3600); call `ApiKeyService.rotateKey`; return 200 with `RotateApiKeyResponse`
  - [ ] 10.7 Implement `GET /v1/api-keys/:keyId/audit`: validate `eventType`, `from`, `to` query params; validate `pageSize` max 200; call `AuditService.query`; return 200 with `AuditLogResponse`
  - [ ] 10.8* Write API integration tests for every endpoint against a test database: happy-path for each verb, 400 for invalid body, 401 when unauthenticated, 403 for cross-owner access attempts, 404 for nonexistent key, 422 when key limit reached, response bodies match TypeScript interface shapes
  - _Requirements: R1.1, R1.3, R1.4, R2.1, R2.2, R2.5, R2.6, R4.2, R4.4, R4.5, R7.5_

- [ ] 11. Middleware Integration and Route Registration
  - [ ] 11.1 Register `ApiKeyAuthMiddleware` globally on the `v1` router (all routes under `/v1` except the key management endpoints themselves, which use session auth)
  - [ ] 11.2 Apply `requireScopes(...)` decorators to each protected endpoint in the route definitions, listing the exact scopes required per verb
  - [ ] 11.3 Wire `AuditService.emit` calls into the middleware post-processing hook so that every auth outcome (success, failure, rate-limited) emits the corresponding audit event without duplicating emit calls in individual handlers
  - [ ] 11.4* Write a route-map test: for each registered protected route, assert that a request without `Authorization` returns 401, and a request with a key lacking the declared scope returns 403
  - _Requirements: R4.1, R6.1, R7.1_

- [ ] 12. Observability and Hardening
  - [ ] 12.1 Register Prometheus metrics: `audit_log_dropped_total` (Counter), `rate_limit_degraded` (Gauge), `auth_middleware_duration_seconds` (Histogram, buckets: 1, 5, 10, 20, 50 ms)
  - [ ] 12.2 Configure the structured logger's redaction list to scrub field keys matching `authorization`, `key`, `rawKey`, and `keyHash` from all log output
  - [ ] 12.3 Assert `WWW-Authenticate: Bearer realm="api"` header is present on all 401 responses emitted by the auth middleware
  - [ ] 12.4* Write a CI log-scraping test: run 50 mixed auth requests (25 success, 15 failure, 10 rate-limited), capture all structured log output, assert no log line's field values match the raw key pattern `kk_live_[A-Za-z0-9]+`
  - [ ] 12.5* Write a timing-consistency test: send 1,000 requests with invalid API keys back-to-back, collect response time samples, assert standard deviation < 2 ms to verify constant-time behaviour in the auth path
  - _Requirements: R3.2, R3.3, R3.5, R6.2, R6.3, R6.5, R7.3_

- [ ] 13. Load Testing and Performance Verification
  - [ ] 13.1 Author a k6 load test script: ramp to 500 virtual users over 60 seconds, each sending 20 req/s against `GET /v1/orders` (or equivalent protected endpoint) using pre-provisioned valid API keys
  - [ ] 13.2 Assert p95 end-to-end response latency ≤ 20 ms in k6 `http_req_duration{p(95)}` thresholds
  - [ ] 13.3 Assert zero HTTP 5xx responses over a 5-minute sustained load plateau
  - [ ] 13.4 Rate-limit burst scenario: single-key burst test — send `capacity + 50` requests within 1 second; assert `http_req_failed` count equals exactly 50 and all failures have status 429 with `RateLimit-Remaining: 0`
  - _Requirements: R5.2, R5.4, R5.6, R6.4_

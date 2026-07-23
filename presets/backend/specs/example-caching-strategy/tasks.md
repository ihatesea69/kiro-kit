# Implementation Plan: Caching Strategy

## Overview

This plan builds the multi-layer caching system from primitive utilities (key builder, error classes) upward through the L1 in-memory cache, the L2 Redis cache, the stampede lock, the SWR coordinator, tag-based invalidation, and the top-level `CacheManager` orchestrator. A final integration task verifies the full stack. Tasks are ordered so each layer can be unit-tested before the layer above it is written. Tasks marked `*` include automated tests as part of their definition of done.

## Tasks

- [ ] 1. Project Setup, Types, and Config
  - [ ] 1.1 Install dependencies: `lru-cache` (v10+, for L1), `ioredis` (L2 + locks), `zod` (config validation)
  - [ ] 1.2 Define `CacheEntry<T>`, `CacheOptions`, and `CacheConfig` TypeScript interfaces in `src/cache/types.ts`
  - [ ] 1.3 Implement `DEFAULT_CACHE_CONFIG` in `src/cache/config.ts` with values: `globalPrefix: 'cache:v1:svc'`, `defaultTtlMs: 60_000`, `l1MaxSize: 1_000`, `l1Ttl: 30_000`, `lockTtlMs: 5_000`, `lockRetryIntervalMs: 50`, `lockRetryCount: 10`, `refreshLockTtlMs: 5_000`, `maxValueSizeBytes: 1_048_576`
  - [ ] 1.4 Implement error classes in `src/cache/errors.ts`: `CacheConfigError extends Error` (carries `ttl` and `staleAfterMs`), `CacheKeyError extends Error` (carries the offending `parts` array), `CacheValueTooLargeError extends Error` (carries `actualBytes` and `maxBytes`), `InvalidationError extends Error` (carries `key` and `cause`)
  - [ ] 1.5* Write unit tests: assert each error class includes the expected extra fields; assert `CacheConfigError.message` identifies which values are misconfigured
  - _Requirements: R4.3, R7.3, R7.4, R7.5_

- [ ] 2. Cache Key Builder
  - [ ] 2.1 Implement `buildCacheKey(namespace: string, ...parts: (string | number)[]): string` in `src/cache/keyBuilder.ts`: coerce each part to string, join with `:`, compute `sha256(joined).hex()`, return `${config.globalPrefix}:${namespace}:${hash}`
  - [ ] 2.2 Implement pre-hash guard: if `parts` is empty, or any element is `null`, `undefined`, or the string `'undefined'`, throw `CacheKeyError` with the offending parts array
  - [ ] 2.3* Write unit tests: same inputs always produce the same key; different inputs always produce different keys (test 1 000 random input pairs); null part throws `CacheKeyError`; empty parts array throws `CacheKeyError`; output length is always constant (globalPrefix + ':' + namespace + ':' + 64 hex chars)
  - _Requirements: R7.1, R7.2, R7.3_

- [ ] 3. In-Memory L1 Cache
  - [ ] 3.1 Implement `MemoryCache` class in `src/cache/memoryCache.ts` wrapping `lru-cache`; constructor accepts `{ maxSize: number, defaultTtl: number }` (both in their respective units for `lru-cache` v10)
  - [ ] 3.2 Implement `MemoryCache.get<T>(key: string): CacheEntry<T> | null` — return the stored `CacheEntry` including `storedAt` so callers can compute age; return `null` for missing or expired entries
  - [ ] 3.3 Implement `MemoryCache.set<T>(key: string, entry: CacheEntry<T>, ttlMs: number): void` — pass `ttl: ttlMs` to `lru-cache`'s `set` so the entry expires correctly
  - [ ] 3.4 Implement `MemoryCache.delete(key: string): void` and `MemoryCache.deleteAll(keys: string[]): void`
  - [ ] 3.5* Write unit tests: `set()` + `get()` within TTL returns entry; `get()` after TTL returns null; after `l1MaxSize` entries, the LRU entry is evicted; `delete()` removes entry immediately; `deleteAll([...])` removes all specified keys
  - _Requirements: R1.1, R1.2, R1.4, R1.6_

- [ ] 4. Redis L2 Cache
  - [ ] 4.1 Implement `RedisCache` class in `src/cache/redisCache.ts` wrapping `ioredis`; constructor accepts an `ioredis.Redis` instance and `CacheConfig`
  - [ ] 4.2 Implement `RedisCache.get<T>(key: string): Promise<CacheEntry<T> | null>`: issue `GET fullKey`; on Redis error log `warn` and return `null` (graceful degradation); deserialise with `JSON.parse`
  - [ ] 4.3 Implement `RedisCache.set<T>(key: string, value: T, ttlMs: number, storedAt: number): Promise<void>`: serialise `{ value, storedAt, ttlMs }` via `JSON.stringify`; check serialised size against `maxValueSizeBytes` (throw `CacheValueTooLargeError` if exceeded); issue `SET fullKey <json> PX <ttlMs>`; on Redis error log `warn` and return without throwing
  - [ ] 4.4 Implement `RedisCache.setIfExists<T>(key: string, value: T, ttlMs: number, storedAt: number): Promise<void>`: same as `set()` but uses `SET fullKey <json> PX <ttlMs> XX` (update only if key exists — used for SWR refresh)
  - [ ] 4.5 Implement `RedisCache.del(key: string): Promise<void>`: issue `DEL fullKey`; propagate Redis errors (callers handle them as `InvalidationError`)
  - [ ] 4.6 Implement `RedisCache.fullKey(key: string): string`: return `${config.globalPrefix}:${key}`
  - [ ] 4.7* Write unit tests using `ioredis-mock`: `set()` + `get()` round-trip; `get()` on expired key returns null; Redis error on `get()` returns null (no throw); `CacheValueTooLargeError` thrown at correct byte threshold; `setIfExists()` is a no-op when key is absent
  - [ ] 4.8* Write integration tests against Testcontainers Redis: key expires after `ttlMs` ms; PX precision (use 500 ms TTL and assert key absent at 600 ms)
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R7.5_

- [ ] 5. Stampede Lock
  - [ ] 5.1 Implement `StampedeLock` class in `src/cache/stampedeLock.ts` with `acquire(lockKey: string, ttlMs: number): Promise<boolean>`: issue `SET lockKey __lock__ NX PX <ttlMs>`; return `true` if the command returned `"OK"`, `false` if `null` (key already existed)
  - [ ] 5.2 Implement `StampedeLock.release(lockKey: string): Promise<void>`: issue `DEL lockKey`; wrap in a try/catch and log `warn` on Redis error rather than propagating
  - [ ] 5.3* Write unit tests using `ioredis-mock`: first `acquire` for a key returns `true`; second concurrent `acquire` for same key returns `false`; after `release`, the key is absent and `acquire` returns `true` again; Redis error on `acquire` returns `false` (safe fallback)
  - _Requirements: R6.1, R6.4, R6.5_

- [ ] 6. SWR Coordinator (In-Process Singleflight)
  - [ ] 6.1 Implement `SwrCoordinator` class in `src/cache/swr.ts` with an internal `Map<string, Promise<unknown>>` tracking active refresh promises per cache key
  - [ ] 6.2 Implement `SwrCoordinator.dedupe<T>(key: string, fn: () => Promise<T>): Promise<T>`: if `key` is already in the map, return the existing promise; otherwise, call `fn()`, store the promise, remove it from the map on resolution or rejection (using `finally`), and return the promise
  - [ ] 6.3* Write unit tests: 10 concurrent `dedupe` calls with same key invoke `fn` exactly once; `fn` throw is propagated to all 10 callers; after resolution, a new `dedupe` call invokes `fn` again
  - _Requirements: R1.5, R3.5, R6.6_

- [ ] 7. Cache Invalidator
  - [ ] 7.1 Implement `CacheInvalidator` class in `src/cache/invalidator.ts` accepting `MemoryCache`, `RedisCache`, and `CacheConfig`
  - [ ] 7.2 Implement `CacheInvalidator.invalidate(key: string): Promise<void>`: call `memoryCache.delete(fullKey)` synchronously; then `await redis.del(fullKey)`; wrap Redis error and re-throw as `InvalidationError`
  - [ ] 7.3 Implement `CacheInvalidator.addTagMembership(key: string, tags: string[], ttlMs: number): Promise<void>`: for each tag, use a Redis pipeline to `SADD cache-tag:{prefix}:{tag} {fullKey}` and `EXPIRE cache-tag:{prefix}:{tag} {ceil(ttlMs/1000)}`; execute pipeline in a single round-trip
  - [ ] 7.4 Implement `CacheInvalidator.invalidateByTag(tag: string): Promise<void>`: `SMEMBERS` the tag set, call `memoryCache.deleteAll(members)`, pipeline `DEL` for all members plus the tag set key; wrap Redis error and re-throw as `InvalidationError`
  - [ ] 7.5* Write unit tests using `ioredis-mock`: `invalidate()` deletes L1 and L2 key; Redis error on `invalidate()` deletes L1 and throws `InvalidationError`; `invalidateByTag()` deletes all tagged keys and the tag set; `addTagMembership()` adds correct keys to tag sets with correct TTLs
  - [ ] 7.6* Write integration tests against Testcontainers Redis: set 5 keys with tag `'product'`; `invalidateByTag('product')`; assert all 5 keys absent; assert tag set absent
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.6_

- [ ] 8. Cache Manager (Orchestrator)
  - [ ] 8.1 Implement `CacheManager` class in `src/cache/cacheManager.ts` composing `MemoryCache`, `RedisCache`, `StampedeLock`, `SwrCoordinator`, and `CacheInvalidator`; constructor accepts `ioredis.Redis` and optional `Partial<CacheConfig>`
  - [ ] 8.2 Implement `CacheManager.getOrFetch<T>(key, fetchFn, options?)`: follow the full read path from design.md Section "Cache-Aside Pattern — Read Path"; validate `staleAfterMs < ttl` at the start and throw `CacheConfigError` if violated; honour `options.bypass` by skipping all cache layers
  - [ ] 8.3 Implement L1 hit logic: check `MemoryCache.get()`; if found and fresh (or SWR disabled), return immediately; if found and soft-stale, trigger background SWR refresh via `SwrCoordinator.dedupe()` + `StampedeLock` on `refresh-lock` key, return stale value
  - [ ] 8.4 Implement L2 hit logic: same freshness check as L1, but also populate L1 with `min(l1Ttl, remainingTtl)` before returning
  - [ ] 8.5 Implement miss logic: attempt `StampedeLock.acquire("cache-lock:{key}")`, call `fetchFn()` if acquired, populate L2 and L1, release lock; if not acquired, poll L2 in a loop; after `lockRetryCount` polls, call `fetchFn()` as fallback and increment `cache_lock_fallback_total`
  - [ ] 8.6 Implement `CacheManager.set<T>(key, value, options?)`: validate size, write to L2 (`RedisCache.set`), write to L1 (`MemoryCache.set`), call `CacheInvalidator.addTagMembership()` if `options.tags` provided
  - [ ] 8.7 Implement `CacheManager.invalidate(key)` and `CacheManager.invalidateByTag(tag)` as thin delegations to `CacheInvalidator`
  - [ ] 8.8 Implement `CacheManager.flushNamespace(version)`: `SCAN` Redis for keys matching `cache:{version}:*` in batches of 100 using the SCAN cursor pattern; pipeline `DEL` for each batch; return `{ deletedCount }`
  - [ ] 8.9* Write comprehensive unit tests (mocked Redis): all 7 paths from the read path design (L1 fresh hit, L1 stale hit + SWR, L2 fresh hit, L2 stale hit + SWR, miss + lock win, miss + lock poll success, miss + lock poll exhausted fallback); `fetchFn` throw does not cache; `bypass: true` skips all layers; `staleAfterMs >= ttl` throws `CacheConfigError`
  - [ ] 8.10* Write integration tests against Testcontainers Redis covering SWR, tag invalidation, stampede with 3 concurrent processes, and Redis degradation (disconnect mid-test)
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R2.1, R2.2, R2.4, R2.5, R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.5, R6.1, R6.2, R6.3, R6.4, R7.1, R7.5, R7.6_

- [ ] 9. Observability
  - [ ] 9.1 Register Prometheus metrics: `cache_hits_total{layer,namespace}` (Counter — increment on L1 and L2 hits separately), `cache_misses_total{namespace}` (Counter), `cache_lock_fallback_total{namespace}` (Counter — incremented when stampede lock poll exhausts), `cache_swr_refresh_total{namespace}` (Counter), `cache_get_duration_seconds{namespace}` (Histogram, buckets: 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1 s)
  - [ ] 9.2 Expose all Prometheus metrics on `GET /metrics`
  - [ ] 9.3 Emit structured `pino` log events for: L1 hit, L2 hit, cache miss, lock acquired, lock fallback, SWR refresh started, SWR refresh completed, SWR refresh failed, Redis degradation (`warn` level), invalidation errors
  - _Requirements: R1.1, R2.4, R6.3_

- [ ] 10. What-Not-to-Cache Guardrails
  - [ ] 10.1 Add a `CacheManager.assertCacheable(options: CacheOptions): void` internal helper that throws `CacheConfigError` with a descriptive message for any of the forbidden scenarios from R7.4: `options.bypass` is redundant with `ttl: 0` (only one should be used); `staleAfterMs >= ttl`; `ttl < 0`
  - [ ] 10.2 Add a lint rule (ESLint custom rule or a comment-based convention) that flags `CacheOptions.tags` arrays containing PII-adjacent literals like `userId`, `sessionId`, or `token` — these require per-user key scoping (i.e. the key parts must include the user ID)
  - [ ] 10.3 Add `CacheManager.setMaxValueSize(bytes)` override for testing but document that production code should rely on the constructor config
  - [ ] 10.4* Write unit tests: assert `assertCacheable` throws for `staleAfterMs >= ttl`, for negative `ttl`, and for explicit `bypass: true` combined with a non-zero `ttl`
  - _Requirements: R7.4, R7.5_

- [ ] 11. HTTP Response Cache Middleware (Optional)
  - [ ] 11.1 Implement `cachingMiddleware(cacheManager, options)` in `src/api/middleware/cachingMiddleware.ts`: for `GET` requests only, build a cache key from `req.method + req.originalUrl`; call `cacheManager.getOrFetch()` wrapping the downstream handler as `fetchFn`; set `Cache-Control: max-age=<ttl/1000>, stale-while-revalidate=<staleAfterMs/1000>` response header to hint CDN/browser caching
  - [ ] 11.2 Ensure the middleware is NEVER applied to endpoints that return authentication tokens, user PII without per-user scoping, or write-operation responses (document this restriction in the middleware JSDoc)
  - [ ] 11.3* Write unit tests: GET `/products` with populated cache returns cached body; POST `/products` bypasses the middleware entirely; `Cache-Control` header matches the TTL configuration
  - _Requirements: R7.4_

- [ ] 12. End-to-End Verification
  - [ ] 12.1 Start a real `CacheManager` backed by Testcontainers Redis
  - [ ] 12.2 L1 hit performance: populate 100 keys; call `getOrFetch` on each 1 000 times; assert p99 latency ≤ 1 ms (measure with `performance.now()`)
  - [ ] 12.3 L2 fallback: start 3 `CacheManager` instances sharing the same Redis; instance A populates a key; assert instance B and C return the same value on next call without hitting the `fetchFn`
  - [ ] 12.4 SWR: set a key with `ttl: 2_000, staleAfterMs: 500`; wait 600 ms (stale); call `getOrFetch` — assert stale value returned immediately; wait 1 s for background refresh; assert fresh value returned on next call; assert `fetchFn` called exactly twice total (once initial, once SWR)
  - [ ] 12.5 Stampede: `DEL` a hot key from Redis; fire 200 concurrent `getOrFetch` calls in the same process; assert `fetchFn` called exactly once; assert all 200 callers receive the same value
  - [ ] 12.6 Tag invalidation: populate 20 keys across 3 tags; invalidate 1 tag (7 keys); assert those 7 keys are absent from both L1 and L2; assert the other 13 keys remain
  - [ ] 12.7 Redis failure degradation: populate a key; disconnect Redis; call `getOrFetch` — assert value returned from L1 without error; flush L1; call `getOrFetch` — assert `fetchFn` called and value returned without throwing; reconnect Redis; assert next write succeeds
  - [ ] 12.8 `flushNamespace`: populate 50 keys under `cache:v1:*` and 50 under `cache:v2:*`; call `flushNamespace('v1')`; assert 0 `cache:v1:*` keys remain in Redis; assert all 50 `cache:v2:*` keys intact
  - _Requirements: R1.1, R2.1, R2.4, R3.1, R3.3, R4.1, R5.1, R5.2, R6.1, R6.3, R7.6_

- [ ] 13. Update Documentation
  - [ ] 13.1 Add JSDoc to `CacheManager.getOrFetch()` documenting all `CacheOptions` fields, SWR behaviour, stampede fallback, and `bypass` semantics, with a worked example showing product-catalog caching with tags
  - [ ] 13.2 Add JSDoc to `buildCacheKey()` with the key format specification, SHA-256 rationale, and a warning not to pass user-controlled values as plain string parts without hashing
  - [ ] 13.3 Add JSDoc to `CacheManager.invalidateByTag()` with an example of write-path invalidation showing the correct order (origin write first, then invalidate)
  - [ ] 13.4 Add a `## Caching` section to the project `README.md` covering: quick-start example (3-line cache-aside), TTL + SWR configuration table, tag-based invalidation example, stampede protection explanation, and a "What NOT to Cache" checklist (auth tokens, write results, per-transaction reads, large blobs > 1 MB)
  - _Requirements: R3.1, R4.1, R5.5, R7.4_

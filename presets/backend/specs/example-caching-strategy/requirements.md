# Requirements Document

## Introduction

This document defines the requirements for a multi-layer caching strategy for a Node.js/TypeScript service. The system provides two cache layers: an in-process LRU cache (L1) for sub-millisecond reads of recently accessed values, and a Redis-backed distributed cache (L2) for cross-process sharing and larger working sets. Both layers follow the cache-aside (lazy population) pattern. The system supports per-entry TTL, stale-while-revalidate (SWR) for background refresh without request blocking, explicit tag-based invalidation on writes, and stampede protection via a Redis lock (singleflight) to prevent multiple simultaneous fetches of the same missing key under high load. The design also defines what MUST NOT be cached to avoid correctness bugs and security vulnerabilities.

## Glossary

- **L1 Cache**: The in-process `lru-cache` instance; survives only within the lifetime of a single Node.js process; extremely fast (sub-millisecond); size-limited by entry count.
- **L2 Cache**: The Redis-backed distributed cache (via `ioredis`); shared across all processes and pods; slightly slower (network round-trip) but globally consistent on invalidation.
- **Cache-Aside**: A read pattern where the application checks the cache before calling the origin; on a miss the application fetches from the origin, populates the cache, and returns the value.
- **Cache Miss**: The state when a requested key is absent from all cache layers, requiring a fetch from the authoritative origin (database, external API, computation).
- **TTL (Time-to-Live)**: The maximum duration a cached value remains valid before being considered stale.
- **Stale-While-Revalidate (SWR)**: A cache policy where a stale (expired) value is returned to the caller immediately while a background task concurrently fetches a fresh value and repopulates the cache.
- **Invalidation**: Removing or marking as stale all cache entries associated with a given key or tag when the underlying data changes, preventing callers from reading outdated values.
- **Cache Tag**: A semantic label associated with one or more cache entries (e.g. `product:42`, `category:electronics`) that groups related entries for batch invalidation.
- **Stampede Protection**: A mechanism that prevents many concurrent requests for the same missing key from all hitting the origin simultaneously; implemented via a Redis lock (only one caller fetches, others wait) or a singleflight in-process coalescer.
- **Cache Key**: A deterministic, namespaced string that uniquely identifies a cached value, constructed from component type, entity identifiers, and an optional version prefix.
- **Origin**: The authoritative data source behind the cache, such as a PostgreSQL query, an external HTTP API, or an expensive computation.

## Out of Scope

- HTTP response caching at the reverse-proxy or CDN layer (Nginx, Cloudflare, Varnish).
- Write-through or write-behind cache update strategies; all writes go directly to the origin.
- Distributed cache invalidation via pub/sub fan-out to L1 caches across pods (L1 entries expire by TTL; invalidation only targets L2).
- Full-page or fragment HTML caching.
- Machine learning model inference result caching (use a dedicated model-serving cache layer).
- Cache warming (pre-population at startup); the system is lazy-loading only.

## Requirements

### Requirement 1: In-Memory L1 Cache

**User Story:** As a backend developer, I want a fast in-process cache that serves repeated reads for the same key within sub-millisecond latency, so that hot objects (e.g. rate-limit configs, tenant settings) do not incur a Redis round-trip on every request.

#### Acceptance Criteria

1. WHEN `cacheManager.get(key)` is called and the key exists in the L1 cache with a non-expired TTL THE SYSTEM SHALL return the cached value without contacting Redis or the origin, with a read latency target of ≤ 1 ms at p99.
2. WHEN the L1 cache reaches its configured `l1MaxSize` entry count (default 1 000) THE SYSTEM SHALL evict the least-recently-used entry to make room for the new one; eviction SHALL happen synchronously before the new entry is inserted.
3. WHERE a value is fetched from L2 (Redis) or the origin and placed into L2, THE SYSTEM SHALL also populate the L1 cache with the same value and a TTL equal to `min(l1Ttl, remainingL2Ttl)`, ensuring L1 never holds a value beyond its L2 expiry.
4. WHEN a cache entry is explicitly invalidated by key or tag THE SYSTEM SHALL immediately delete the corresponding L1 entry (synchronously) before returning; L1 SHALL NOT serve the stale entry on any subsequent call even if the L1 TTL has not elapsed.
5. IF a process has multiple simultaneous calls with the same key and the key is absent from L1 THE SYSTEM SHALL use an in-process singleflight map (keyed by cache key) to coalesce all in-flight L2/origin fetches into a single operation; all waiters SHALL receive the same resolved value.
6. WHEN a Node.js process restarts THE SYSTEM SHALL start with an empty L1 cache; no persistence or warm-up mechanism is provided; the first request for each key after restart will be an L1 miss falling through to L2 or the origin.

### Requirement 2: Distributed Redis L2 Cache

**User Story:** As a platform operator, I want a Redis-backed shared cache so that multiple instances of the same service share a common working set, preventing each pod from independently hammering the database on startup or after a deploy.

#### Acceptance Criteria

1. WHEN `cacheManager.get(key)` produces an L1 miss THE SYSTEM SHALL issue a `GET` command to Redis for the cache key; if the key exists in Redis THE SYSTEM SHALL deserialise the stored JSON, populate L1, and return the value without calling the origin.
2. WHEN a value is fetched from the origin and stored in the L2 cache THE SYSTEM SHALL call `SET key <json> PX <ttlMs>` to set the value with an exact millisecond-precision TTL; THE SYSTEM SHALL NOT use `EX` (second precision) to avoid rounding errors on short TTLs.
3. WHEN a cache entry has been in Redis for longer than its TTL THE SYSTEM SHALL allow Redis's native key expiry to remove it; no application-level sweep or scan is required.
4. IF Redis is unreachable when `cacheManager.get(key)` attempts a GET THE SYSTEM SHALL log a `warn` event, skip the L2 lookup entirely, and proceed to call the origin directly; a Redis outage SHALL NOT cause request failures — the cache degrades gracefully.
5. IF Redis is unreachable when `cacheManager.set(key, value, options)` is called after a successful origin fetch THE SYSTEM SHALL log a `warn` event and return the value to the caller without storing it; subsequent calls for the same key will repeat the origin fetch until Redis recovers.
6. WHERE multiple service pods share the same Redis instance THE SYSTEM SHALL store all cache keys under a configurable namespace prefix (e.g. `cache:{version}:{service}:{key}`) to prevent key collisions between services and allow namespace-scoped flushes during deployments.

### Requirement 3: Cache-Aside Read Pattern

**User Story:** As a backend developer, I want a single `cacheManager.getOrFetch(key, fetchFn, options)` method that transparently checks L1, checks L2, and falls through to my fetch function, so that I never need to write manual cache-check boilerplate in route handlers.

#### Acceptance Criteria

1. WHEN `cacheManager.getOrFetch(key, fetchFn, options)` is called THE SYSTEM SHALL first check L1, then L2, and only call `fetchFn()` on a complete miss; the value returned by `fetchFn()` SHALL be stored in both L2 and L1 with the configured TTL before being returned to the caller.
2. WHEN `fetchFn()` throws an error THE SYSTEM SHALL propagate the error to the caller without storing any value in L1 or L2; a failed fetch SHALL NOT poison the cache with an error object.
3. WHERE the cached value in L2 is within its TTL but past its SWR `staleAfterMs` threshold THE SYSTEM SHALL return the stale value immediately to the caller AND asynchronously trigger a background refresh by calling `fetchFn()` without blocking the current request.
4. WHEN the background SWR refresh triggered by the `staleAfterMs` threshold completes successfully THE SYSTEM SHALL atomically update L2 with the fresh value using `SET key <json> PX <ttlMs> XX` (update only if the key still exists) and update L1 with the new value; if `fetchFn()` throws during SWR THE SYSTEM SHALL log a `warn` and retain the current stale L2 value.
5. WHERE SWR is enabled and multiple concurrent calls find the same stale value THE SYSTEM SHALL ensure only one background refresh is launched per key using the same in-process singleflight coalescer used for stampede protection; duplicate background refresh goroutines SHALL be suppressed.
6. IF `options.ttl` is not supplied when calling `getOrFetch()` THE SYSTEM SHALL fall back to the global default `defaultTtlMs` (default 60 000 ms / 60 s) configured in `CacheConfig`.

### Requirement 4: TTL and Stale-While-Revalidate

**User Story:** As a backend developer, I want fine-grained TTL control per cache entry and the option to serve stale values while a background refresh is in flight, so that I can tune freshness versus latency trade-offs per data type.

#### Acceptance Criteria

1. WHEN a cache entry is created with `options.ttl` THE SYSTEM SHALL store it in Redis with a `PX <ttl>` expiry and in L1 with the same TTL; the TTL countdown starts from the moment the entry is written to cache, not from the moment it was fetched from the origin.
2. WHERE `options.staleAfterMs` is configured and is less than `options.ttl` THE SYSTEM SHALL treat an entry as "soft stale" when `age > staleAfterMs` but still within TTL; a soft-stale entry SHALL be served immediately and trigger a background SWR refresh per Requirement 3.
3. IF `options.staleAfterMs >= options.ttl` THE SYSTEM SHALL throw a `CacheConfigError` at call time identifying the misconfiguration rather than silently using an invalid configuration.
4. WHEN a background SWR refresh is in progress THE SYSTEM SHALL write a `refresh-lock:{key}` Redis string with a short TTL (default `refreshLockTtlMs: 5 000`) using `SET NX PX` before launching the refresh; if another process already holds the lock THE SYSTEM SHALL skip launching a duplicate refresh and return the stale value to the caller.
5. WHERE an entry's L2 key has been evicted by Redis's maxmemory policy (LRU) before its TTL expires THE SYSTEM SHALL handle this transparently as a cache miss on the next `getOrFetch()` call; no special treatment beyond the standard miss path is needed.
6. WHEN `options.ttl` is set to 0 THE SYSTEM SHALL bypass both L1 and L2 cache writes for that call, fetching from the origin directly and returning the value without caching; this allows callers to explicitly opt out of caching on a per-call basis.

### Requirement 5: Explicit Invalidation on Writes

**User Story:** As a backend developer, I want to invalidate cache entries when I write to the database, so that callers never read stale data after a mutation.

#### Acceptance Criteria

1. WHEN `cacheManager.invalidate(key)` is called THE SYSTEM SHALL synchronously delete the L1 entry for `key` and issue a Redis `DEL` command for the corresponding L2 key; THE SYSTEM SHALL await the Redis `DEL` before returning to ensure the invalidation is durable before any subsequent reads.
2. WHEN `cacheManager.invalidateByTag(tag)` is called THE SYSTEM SHALL retrieve all cache keys associated with `tag` from a Redis set `cache-tag:{namespace}:{tag}`, issue a Redis pipeline `DEL` for each key, delete the tag set itself, and remove the corresponding L1 entries.
3. WHEN a value is stored via `getOrFetch()` or `set()` with `options.tags` (an array of tag strings) THE SYSTEM SHALL execute a Redis pipeline that: (a) sets the cache key with its TTL; (b) for each tag, calls `SADD cache-tag:{namespace}:{tag} {key}` and sets a TTL on the tag set equal to the entry TTL; so that tag sets do not outlive the entries they reference.
4. IF Redis is unreachable when `invalidate()` or `invalidateByTag()` is called THE SYSTEM SHALL still delete the L1 entry (in-process, always succeeds), log a `warn` for the Redis failure, and throw an `InvalidationError` so the caller knows the L2 invalidation did not complete; callers may choose to retry or accept the residual L2 TTL as the effective staleness window.
5. WHEN a write operation completes in a service layer THE SYSTEM SHALL call `cacheManager.invalidate(key)` or `cacheManager.invalidateByTag(tag)` within the same logical transaction context (or immediately after a successful database commit) to minimise the window between the DB write and the cache invalidation.
6. WHERE a database transaction rolls back after a cache invalidation has already been issued THE SYSTEM SHALL accept this as a benign over-invalidation; the subsequent `getOrFetch()` call will re-populate the cache from the still-valid database state.

### Requirement 6: Cache Stampede Protection

**User Story:** As a platform operator, I want to ensure that when a popular cache entry expires, only one request fetches the fresh value from the database while all others wait or receive a slightly stale value, so that database load does not spike on cache misses.

#### Acceptance Criteria

1. WHEN `getOrFetch(key, fetchFn, options)` encounters a complete cache miss (absent from both L1 and L2) THE SYSTEM SHALL attempt to acquire a Redis lock `cache-lock:{namespace}:{key}` using `SET NX PX {lockTtlMs}` before calling `fetchFn()`; only the request that acquires the lock SHALL call `fetchFn()`.
2. WHEN a request fails to acquire the cache lock THE SYSTEM SHALL retry the L2 GET at `lockRetryIntervalMs` (default 50 ms) intervals up to `lockRetryCount` (default 10) times, waiting for the lock holder to populate the cache; if the cache key is populated before retries are exhausted THE SYSTEM SHALL return the newly populated value.
3. IF all lock retry attempts are exhausted and the cache is still empty THE SYSTEM SHALL call `fetchFn()` directly as a fallback ("stampede allowed" mode), ensuring the request does not fail; the lock failure SHALL be logged as a `warn` event and increment the `cache_lock_fallback_total` counter metric.
4. WHEN the lock-holding request completes `fetchFn()` THE SYSTEM SHALL populate L2 (then L1), and release the lock by calling `DEL cache-lock:{namespace}:{key}`; the lock SHALL be released even if `fetchFn()` throws (using a `finally` block).
5. WHERE stampede protection is in use and the lock TTL (`lockTtlMs`, default 5 000 ms) expires before `fetchFn()` completes THE SYSTEM SHALL allow another waiter to acquire the lock and attempt its own fetch; this prevents a crashed lock holder from blocking all waiters indefinitely.
6. IF an in-process singleflight map is available (same Node.js process, same key) THE SYSTEM SHALL use it as a first-pass deduplication layer before attempting the Redis lock; this eliminates redundant Redis lock attempts from concurrent requests within the same process.

### Requirement 7: Cache Key Design and What Not to Cache

**User Story:** As a backend developer, I want a deterministic, collision-resistant cache key convention and clear guidance on which data types MUST NOT be cached, so that I avoid hard-to-debug correctness bugs and security vulnerabilities.

#### Acceptance Criteria

1. WHEN a cache key is constructed using `buildCacheKey(namespace, ...parts)` THE SYSTEM SHALL return a string in the form `{globalPrefix}:{namespace}:{sha256(parts.join(':'))}` where `globalPrefix` is the configured service-level prefix (e.g. `cache:v1:orders-svc`); all parts are coerced to strings before hashing.
2. WHERE the cache key `parts` array contains user-supplied input (e.g. query parameters, user IDs) THE SYSTEM SHALL hash the parts to a fixed-length SHA-256 hex digest rather than concatenating them directly, preventing key-length attacks and characters that could conflict with the `:` delimiter.
3. IF `buildCacheKey()` is called with zero `parts` or with any `part` that is `undefined` or `null` THE SYSTEM SHALL throw a `CacheKeyError` rather than silently producing an invalid key such as `cache:v1:orders-svc:undefined`.
4. WHEN caching is applied THE SYSTEM SHALL NOT cache any of the following: (a) responses containing authentication tokens, session data, or per-user PII without per-user key scoping; (b) results of write operations or side-effectful function calls; (c) values that change on every call (e.g. `Date.now()`, random UUIDs, CSRF tokens); (d) data that must be consistent to within a single transaction (i.e. data read inside a DB transaction that must not reflect intermediate states); (e) large payloads exceeding `maxValueSizeBytes` (default 1 MB) which should be stored in object storage instead.
5. WHEN `cacheManager.set()` is called with a value whose serialised JSON size exceeds `maxValueSizeBytes` THE SYSTEM SHALL throw a `CacheValueTooLargeError` with the actual and maximum sizes rather than silently storing a truncated value; callers are responsible for reducing payload size or choosing a different storage mechanism.
6. WHERE the cache key includes a `version` component in the global prefix (e.g. `cache:v2:`) THE SYSTEM SHALL provide a `cacheManager.flushNamespace(version)` method that deletes all keys matching `cache:{version}:*` using a Redis `SCAN` + `DEL` pipeline, enabling a full cache invalidation at deploy time without downtime.

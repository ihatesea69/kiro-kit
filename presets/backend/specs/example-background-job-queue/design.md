# Design: Background Job Queue

## Architecture

### System Context

The background job queue sits between synchronous application code and work that should not execute inline. HTTP handlers, event listeners, and cron triggers act as producers, writing job records to Redis via BullMQ. Worker processes — which may run in separate containers or on the same host — poll named queues, acquire exclusive visibility locks, execute handler functions, and write outcomes back to Redis. A thin HTTP status API wraps BullMQ's inspection methods to expose job state to internal callers. A `DLQHandler` manages the dead-letter queue and exposes replay and discard endpoints.

### Component Design

```
Producer (HTTP Handler / Event Listener / Cron)
  └─> QueueProducer                # producer.enqueue() — validates payload,
        ├─> IdempotencyStore       #   checks iq:{queue}:{key} in Redis via SET NX
        └─> BullMQ Queue           #   calls queue.add() → bull:{queueName}:waiting
                │
                ▼
       JobWorker (N concurrent slots)
         ├─> HandlerRegistry       # maps jobName → async handler function
         ├─> LockHeartbeat         # BullMQ auto-renews lock when < 10 s remain
         ├─> BackoffCalculator     # min(base × 2^(n-1) + jitter, max)
         └─> BullMQ Worker         # polls queue, acquires lock, calls handler
               ├── on 'completed'  → emit job.completed; retain for retentionMs
               ├── on 'failed'     → if maxAttempts reached: DLQHandler.moveToDLQ()
               │                     else: schedule retry with calculateDelay()
               └── on 'stalled'    → BullMQ re-queues; emit job.stalled

       DLQHandler
         └─> DLQRepository         # dlq:{queueName}:{dlqJobId} Redis hashes
               ├── replay()        → QueueProducer.enqueue(), attemptsMade = 0
               └── discard()       → delete DLQ entry

       JobStatusAPI (Express / Fastify)
         ├─> GET  /jobs/:jobId         # BullMQ Queue.getJob(id)
         ├─> GET  /jobs                # BullMQ Queue.getJobs([states], start, end)
         ├─> GET  /jobs/dlq            # DLQRepository.list(filters, pagination)
         ├─> POST /jobs/dlq/:id/replay # DLQHandler.replay()
         └─> DELETE /jobs/dlq/:id      # DLQHandler.discard()
```

### Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> waiting : producer.enqueue()
    waiting --> waiting : delayMs not yet elapsed\n(scheduledFor in the future)
    waiting --> active : worker acquires lock\n(bull:{queue}:{id}:lock SET)
    active --> completed : handler resolves\n(result stored, lock released)
    active --> failed : handler throws (not NonRetryableError)\nattemptsMade < maxAttempts
    active --> dead_lettered : handler throws NonRetryableError\nOR attemptsMade == maxAttempts
    active --> waiting : lock expires / stall checker fires\n(attemptsMade < maxAttempts; re-queued)
    failed --> waiting : backoff delay elapses\n(scheduledFor reached)
    failed --> dead_lettered : attemptsMade == maxAttempts\n(on final retry failure)
    dead_lettered --> waiting : POST /jobs/dlq/:id/replay\n(new jobId; attemptsMade reset to 0)
    dead_lettered --> [*] : DELETE /jobs/dlq/:id\n(permanently discarded)
    completed --> [*] : auto-clean after retentionMs
```

## Data Models

### Job

```typescript
interface Job<P = unknown> {
  id: string;                    // UUID v4 — BullMQ job ID
  queueName: string;             // e.g. "email-delivery"
  jobName: string;               // e.g. "sendWelcomeEmail" — maps to a registered handler
  payload: P;                    // arbitrary JSON-serialisable data
  status: JobStatus;
  attemptsMade: number;          // 0 on first enqueue; increments on each failure
  maxAttempts: number;           // default 5
  lastError: JobError | null;    // most recent failure; null on waiting/completed
  result: unknown | null;        // handler's resolved value (completed jobs only)
  progress: number;              // 0–100; updated via job.updateProgress()
  idempotencyKey: string | null;
  enqueuedAt: Date;              // UTC
  scheduledFor: Date | null;     // set when delayMs > 0 or during retry backoff window
  startedAt: Date | null;
  completedAt: Date | null;
  deadLetteredAt: Date | null;
}

type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'dead-lettered';

interface JobError {
  message: string;
  stack: string | null;
  attemptNumber: number;   // which attempt produced this error (1-indexed)
  failedAt: Date;          // UTC
}

interface JobOptions {
  idempotencyKey?: string;       // optional caller-supplied dedup key
  idempotencyTtlMs?: number;     // default 86_400_000 (24 hours)
  delayMs?: number;              // min 0; defers delivery by this many milliseconds
  maxAttempts?: number;          // default 5
  backoff?: BackoffConfig;
  visibilityTimeout?: number;    // seconds; default 30
}

interface BackoffConfig {
  baseDelay: number;   // ms; default 1_000
  maxDelay: number;    // ms; default 30_000
}
```

### DLQEntry

```typescript
interface DLQEntry {
  id: string;                    // UUID v4 — DLQ record ID
  originalJobId: string;         // the BullMQ job ID before DLQ
  queueName: string;
  jobName: string;
  payload: unknown;              // full original payload, unmodified
  errorHistory: JobError[];      // up to 10 entries; oldest dropped when limit reached
  attemptsMade: number;          // total attempts before dead-lettering
  deadLetteredAt: Date;          // UTC
  status: DLQEntryStatus;
  replayedAt: Date | null;
  replayedJobId: string | null;  // new jobId after POST /jobs/dlq/:id/replay
}

type DLQEntryStatus = 'pending' | 'replayed' | 'discarded';
```

### EnqueueResult

```typescript
interface EnqueueResult {
  jobId: string;
  isDuplicate: boolean;   // true when idempotency key matched an existing job
  result?: unknown;       // present only when the duplicate is a completed job
  scheduledFor?: string;  // ISO 8601; present when delayMs > 0
}
```

### Redis Key Layout

```
bull:{queueName}:waiting            — BullMQ sorted set (score = processAt epoch ms)
bull:{queueName}:active             — BullMQ set of active job IDs
bull:{queueName}:failed             — BullMQ set of failed job IDs
bull:{queueName}:{jobId}            — BullMQ hash of all job fields
bull:{queueName}:{jobId}:lock       — BullMQ lock (string; value = worker token; TTL = visibilityTimeout)
bull:{queueName}:dlq:waiting        — BullMQ sorted set for dead-letter queue
iq:{queueName}:{idempotencyKey}     — string → jobId; TTL = idempotencyTtlMs
dlq:{queueName}:{dlqEntryId}        — Redis hash of DLQEntry fields
```

## Files & Interfaces

```
src/
  queue/
    producer.ts                  # QueueProducer — enqueue(), idempotency, serialisation
    worker.ts                    # JobWorker — start(), stop(), concurrency, SIGTERM handler
    config.ts                    # QueueConfig interface + defaults
    types.ts                     # Job, DLQEntry, JobOptions, BackoffConfig, JobStatus
    errors.ts                    # QueueConnectionError, JobSerializationError, NonRetryableError
    utils/
      backoff.ts                 # calculateDelay(attemptsMade, config): number
      idempotency.ts             # IdempotencyStore — getOrCreate(), get()
    dlq/
      dlqHandler.ts              # DLQHandler — moveToDLQ(), replay(), discard()
      dlqRepository.ts           # Redis persistence for DLQEntry records
    workers/
      jobWorker.ts               # BullMQ Worker wrapper; lock heartbeat; event wiring
      handlerRegistry.ts         # HandlerRegistry — register(name, fn), resolve(name)
  api/
    routes/
      jobs.ts                    # Express router: all /jobs/* endpoints
    middleware/
      errorHandler.ts            # Maps QueueConnectionError / JobSerializationError → HTTP
```

**Key exported signatures:**

```typescript
// src/queue/producer.ts
export class QueueProducer {
  constructor(redis: Redis, config?: Partial<QueueConfig>);
  enqueue<P>(
    queueName: string,
    jobName: string,
    payload: P,
    options?: JobOptions,
  ): Promise<EnqueueResult>;
}

// src/queue/worker.ts
export class JobWorker {
  constructor(redis: Redis, config?: Partial<QueueConfig>);
  register<P>(jobName: string, handler: JobHandler<P>): void;
  start(queueName: string): void;
  stop(): Promise<void>;   // graceful shutdown
}

type JobHandler<P> = (payload: P, job: BullMQJob) => Promise<unknown>;

// src/queue/utils/backoff.ts
export function calculateDelay(attemptsMade: number, config: BackoffConfig): number;
// Returns min(baseDelay × 2^(attemptsMade-1) + floor(random() × baseDelay), maxDelay)

// src/queue/dlq/dlqHandler.ts
export class DLQHandler {
  moveToDLQ(job: BullMQJob, error: Error): Promise<void>;
  replay(dlqEntryId: string): Promise<{ newJobId: string }>;
  discard(dlqEntryId: string): Promise<void>;
}
```

## Retry & DLQ

### Backoff Formula

For attempt number `n` (1-indexed, where n = 1 is the first retry after the original failure):

```
delay(n) = min(baseDelay × 2^(n-1) + jitter, maxDelay)
jitter   = Math.floor(Math.random() * baseDelay)
```

With defaults (`baseDelay = 1 000 ms`, `maxDelay = 30 000 ms`):

| Attempt n | Base delay | Max jitter | Effective range |
|-----------|-----------|-----------|----------------|
| 1 | 1 000 ms | 1 000 ms | 1 000 – 2 000 ms |
| 2 | 2 000 ms | 1 000 ms | 2 000 – 3 000 ms |
| 3 | 4 000 ms | 1 000 ms | 4 000 – 5 000 ms |
| 4 | 8 000 ms | 1 000 ms | 8 000 – 9 000 ms |
| 5+ | capped | 1 000 ms | 30 000 – 31 000 ms |

BullMQ's `backoffStrategy` is set to `'custom'` and backed by a function that calls `calculateDelay(job.attemptsMade, config)`.

### DLQ Transition

When `job.attemptsMade === maxAttempts` on a final failure, the BullMQ `'failed'` event listener calls `DLQHandler.moveToDLQ()`:

1. Calls `job.moveToFailed(new Error('DLQ: max attempts reached'), token, true)` — the third argument (`removeOnFail: true`) atomically removes the job from the `failed` set, preventing the stall checker from re-queuing it.
2. Builds a `DLQEntry` with the full error history (capped at 10 entries).
3. Calls `dlqQueue.add(dlqEntryId, entry)` to persist the entry in the `{queueName}:dlq` BullMQ queue.
4. Emits `job.dead_lettered` on the Node.js `EventEmitter` bus for alerting integrations.

The `moveToFailed` + `dlqQueue.add` sequence is non-atomic across two queues; however, `moveToFailed` is idempotent and the DLQ add can be retried safely if it fails.

## Idempotency

The `IdempotencyStore` uses a two-phase Redis pattern to handle the gap between `SET NX` and the async `queue.add()` call:

```typescript
// src/queue/utils/idempotency.ts
export class IdempotencyStore {
  async getOrCreate(
    queueName: string,
    idempotencyKey: string,
    ttlMs: number,
    createFn: () => Promise<string>,  // calls queue.add(); returns jobId
  ): Promise<{ jobId: string; isDuplicate: boolean }> {
    const redisKey = `iq:${queueName}:${idempotencyKey}`;
    // Phase 1: atomically claim the key with a sentinel
    const claimed = await this.redis.set(redisKey, '__pending__', 'NX', 'PX', ttlMs);
    if (claimed === null) {
      // Key already exists — wait briefly for sentinel to resolve if needed
      const existing = await this.redis.get(redisKey);
      return { jobId: existing!, isDuplicate: true };
    }
    // Phase 2: we own the key — create the job and replace sentinel with real jobId
    const jobId = await createFn();
    await this.redis.set(redisKey, jobId, 'XX', 'KEEPTTL');
    return { jobId, isDuplicate: false };
  }
}
```

The `XX KEEPTTL` update replaces the `__pending__` sentinel with the real `jobId` without resetting the TTL. Concurrent callers that see `__pending__` in the brief creation window will receive it and can retry or treat it as a transient duplicate.

## Visibility Timeout & Locking

BullMQ implements visibility locks using Redis key `bull:{queueName}:{jobId}:lock` with a TTL equal to `lockDuration` ms. The `JobWorker` initialises BullMQ's `Worker` with:

```typescript
new Worker(queueName, processorFn, {
  connection: redis,
  concurrency: config.concurrency,
  lockDuration: config.visibilityTimeout * 1_000,   // convert to ms
  stalledInterval: config.stalledInterval,           // default 30_000 ms
  maxStalledCount: 1,                               // after 1 stall: move to failed
});
```

Lock renewal (heartbeat) is handled by BullMQ's built-in `extendLock` mechanism, which fires automatically when `lockDuration / 2` ms remain. No application-level heartbeat code is required.

## Error Handling

| Error Class | When Thrown | HTTP Mapping | Retry Behaviour |
|-------------|------------|-------------|----------------|
| `JobSerializationError` | Payload not JSON-serialisable | 400 Bad Request | Never enqueued |
| `QueueConnectionError` | Redis unreachable at enqueue time | 503 Service Unavailable (`Retry-After: 5`) | Caller decides; `isRetryable: true` |
| `NonRetryableError` | Handler throws business-fatal error | No HTTP surface | Skip retries → DLQ immediately |
| `Error` (any other) | Handler throws generic error | No HTTP surface | Retry with backoff up to `maxAttempts` |

All API error responses follow the same envelope used across the backend preset:

```typescript
interface ApiError {
  error: string;          // SCREAMING_SNAKE_CASE machine-readable code
  message?: string;       // optional human-readable explanation
  [key: string]: unknown; // additional context fields
}
```

HTTP 404 `JOB_NOT_FOUND` is returned when `BullMQQueue.getJob(id)` returns `null` (BullMQ returns null for both never-existed and auto-cleaned jobs).

## Testing Strategy

**Unit tests** (Jest / Vitest — no real Redis):
- `calculateDelay()` — verify formula at attempts 1–6; assert cap at `maxDelay`; run 10 000 samples and assert every result is within `[baseDelay × 2^(n-1), baseDelay × 2^(n-1) + baseDelay]` before the cap.
- `IdempotencyStore.getOrCreate()` — mock `ioredis`: first call invokes `createFn` and returns `isDuplicate: false`; second call with same key returns existing `jobId` and `isDuplicate: true`; `Promise.all` of 10 concurrent calls produces exactly 1 unique `jobId`.
- `QueueProducer.enqueue()` — mock BullMQ `Queue` and `IdempotencyStore`: assert `queue.add()` called once for unique key, zero times for duplicate idempotency key, `JobSerializationError` thrown synchronously for `BigInt` payload.
- `JobWorker` event dispatch — mock BullMQ `Worker` events: `completed` marks job done; `failed` at `maxAttempts` routes to `DLQHandler.moveToDLQ`; `failed` below `maxAttempts` schedules retry with correct delay.
- `DLQHandler.moveToDLQ()` — assert `DLQRepository.create()` called with full error history; assert `job.dead_lettered` event emitted; assert error history capped at 10 entries.

**Integration tests** (Testcontainers Redis):
- Full cycle: enqueue → worker pickup → completion; assert `GET /jobs/:jobId` returns `status: completed` with non-null `result`.
- Retry flow: handler fails on attempts 1 and 2, succeeds on attempt 3; assert `attemptsMade: 3` and `status: completed`.
- Max retries → DLQ: handler always throws generic `Error`; with `maxAttempts: 3`, assert job appears in `GET /jobs/dlq` after exactly 3 failures.
- Idempotency dedup: 10 concurrent `enqueue` calls with the same `idempotencyKey`; assert exactly 1 BullMQ job exists; all 10 calls return the same `jobId`.
- DLQ replay: move a job to DLQ, call `POST /jobs/dlq/:id/replay` with a handler that now succeeds; assert new job completes and DLQ entry `status` is `replayed`.
- Graceful shutdown: start a handler with a 5 s sleep, send SIGTERM after 1 s, assert job completes and process exits with code 0.
- Stall recovery: kill worker with SIGKILL mid-job; wait `stalledInterval + 5 s`; assert a second worker picks up and completes the job.

**Load tests** (k6):
- Ramp to 200 concurrent producers enqueuing 10 jobs each; assert p95 enqueue latency ≤ 50 ms.
- 50-worker scenario: assert 5 000 jobs all reach `completed` within 120 s.
- Assert `queue_jobs_dead_lettered_total` counter equals 0 when all handlers succeed.

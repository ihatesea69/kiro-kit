# Implementation Plan: Background Job Queue

## Overview

This plan builds the background job queue from the Redis connection layer upward through types, backoff utilities, idempotency, job production, worker processing, DLQ handling, graceful shutdown, and the HTTP status API. Each task is independently completable; higher-numbered tasks depend on the outputs of lower-numbered ones. The order enforces the invariant that no layer is written before the layer it depends on.

Tasks marked `*` include automated tests as part of their definition of done. Traceability references at the end of each top-level task point to specific requirement acceptance criteria in `requirements.md`.

## Tasks

- [ ] 1. Project Setup and Redis Connection
  - [ ] 1.1 Install dependencies: `bullmq`, `ioredis`, `uuid`, `zod` (payload schema validation), `pino` (structured logging)
  - [ ] 1.2 Define `QueueConfig` interface in `src/queue/config.ts` with fields: `concurrency` (default 5), `baseDelay` (default 1 000 ms), `maxDelay` (default 30 000 ms), `maxAttempts` (default 5), `visibilityTimeout` (default 30 s), `stalledInterval` (default 30 000 ms), `shutdownTimeoutMs` (default 30 000 ms), `completedJobRetentionMs` (default 604 800 000), `dlqRetentionMs` (default 2 592 000 000)
  - [ ] 1.3 Implement `createRedisConnection(url: string): Redis` in `src/queue/config.ts` returning an `ioredis` instance configured with `maxRetriesPerRequest: null` and `enableReadyCheck: false` (both required by BullMQ)
  - [ ] 1.4* Write connectivity smoke test: assert `redis.ping()` returns `"PONG"` against a Testcontainers Redis instance; assert the factory does not retry indefinitely when the URL is invalid
  - _Requirements: R1.6, R2.2, R6.4_

- [ ] 2. Core Types and Error Classes
  - [ ] 2.1 Define `Job<P>`, `JobStatus`, `JobError`, `JobOptions`, `BackoffConfig`, `DLQEntry`, `DLQEntryStatus`, and `EnqueueResult` TypeScript interfaces in `src/queue/types.ts`
  - [ ] 2.2 Implement `QueueConnectionError extends Error` in `src/queue/errors.ts` with property `isRetryable: boolean` (default `true`)
  - [ ] 2.3 Implement `JobSerializationError extends Error` in `src/queue/errors.ts` with property `payload: unknown` holding the un-serialisable value
  - [ ] 2.4 Implement `NonRetryableError extends Error` in `src/queue/errors.ts` — handlers throw this subclass to bypass all remaining retries and go directly to the DLQ
  - [ ] 2.5* Write unit tests: assert `QueueConnectionError.isRetryable === true`, assert `NonRetryableError instanceof Error`, assert `JobSerializationError.payload` carries the offending value reference
  - _Requirements: R1.5, R1.6, R3.4_

- [ ] 3. Backoff Calculator
  - [ ] 3.1 Implement `calculateDelay(attemptsMade: number, config: BackoffConfig): number` in `src/queue/utils/backoff.ts` using `min(baseDelay × 2^(attemptsMade - 1) + Math.floor(Math.random() * baseDelay), maxDelay)`
  - [ ] 3.2* Write unit tests: assert attempt 1 returns value in `[1000, 2000]` ms with defaults; assert attempt 4 returns value in `[8000, 9000]` ms; assert attempt 10 returns value ≤ `maxDelay + baseDelay`; run 10 000 samples with defaults and assert no result exceeds 31 000 ms
  - _Requirements: R3.1, R3.5_

- [ ] 4. Idempotency Store
  - [ ] 4.1 Implement `IdempotencyStore` class in `src/queue/utils/idempotency.ts` with method `getOrCreate(queueName, key, ttlMs, createFn)` using a two-phase SET NX + XX KEEPTTL pattern as described in design.md
  - [ ] 4.2 Implement `IdempotencyStore.get(queueName, key): Promise<{ jobId: string | null }>` for checking existing idempotency records without creating a new job
  - [ ] 4.3* Write unit tests using `ioredis-mock`: first call invokes `createFn` exactly once and returns `isDuplicate: false`; second call with same key returns existing `jobId` and `isDuplicate: true`; `Promise.all` of 10 concurrent `getOrCreate` calls produces exactly 1 unique `jobId` and invokes `createFn` exactly once
  - [ ] 4.4* Write integration tests against Testcontainers Redis: assert `iq:{queueName}:{key}` has correct TTL immediately after creation; assert the key is absent after the TTL expires (using a 200 ms TTL in the test)
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5_

- [ ] 5. Queue Producer
  - [ ] 5.1 Implement `QueueProducer` class in `src/queue/producer.ts`: constructor accepts an `ioredis` `Redis` instance and optional `Partial<QueueConfig>`; lazily initialises BullMQ `Queue` instances keyed by `queueName`
  - [ ] 5.2 Implement `QueueProducer.enqueue<P>(queueName, jobName, payload, options?)`: (a) attempt `JSON.stringify(payload)` and throw `JobSerializationError` on failure; (b) if `idempotencyKey` provided, call `IdempotencyStore.getOrCreate()` which gates the BullMQ `queue.add()` call; (c) otherwise call `queue.add()` directly; (d) return `EnqueueResult`
  - [ ] 5.3 Catch ioredis `ECONNREFUSED` and other connection errors and re-throw as `QueueConnectionError` with `isRetryable: true`
  - [ ] 5.4* Write unit tests with mocked BullMQ and ioredis: `queue.add()` called once for unique key; called zero times for duplicate idempotency key; `JobSerializationError` thrown for `BigInt` payload before Redis is contacted; `QueueConnectionError` thrown when ioredis throws `ECONNREFUSED`
  - [ ] 5.5* Write integration tests against Testcontainers Redis: enqueue 5 jobs, assert 5 jobs visible via `queue.getWaiting()`; enqueue with same `idempotencyKey` 3 times, assert exactly 1 job in queue; `delayMs: 5000` job appears in `waiting` with future `scheduledFor`
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R5.1, R5.2, R5.5_

- [ ] 6. Handler Registry
  - [ ] 6.1 Implement `HandlerRegistry` class in `src/queue/workers/handlerRegistry.ts` with `register<P>(jobName: string, handler: JobHandler<P>): void` and `resolve(jobName: string): JobHandler | undefined`
  - [ ] 6.2 Implement the central dispatcher function fed into BullMQ's `Worker` processor: call `HandlerRegistry.resolve(job.name)`; if no handler found, throw `new NonRetryableError(\`No handler registered for job: ${job.name}\`)` to prevent infinite retry loops on unrecognised job names
  - [ ] 6.3* Write unit tests: assert registered handler is returned by `resolve`; assert `resolve` returns `undefined` for an unregistered name; assert dispatcher throws `NonRetryableError` for unregistered names; assert handler receives the correct `payload` and `job` arguments
  - _Requirements: R2.1, R2.4, R2.5_

- [ ] 7. Job Worker
  - [ ] 7.1 Implement `JobWorker` class in `src/queue/workers/jobWorker.ts` wrapping BullMQ `Worker`; constructor accepts `redis`, `HandlerRegistry`, and `config`
  - [ ] 7.2 Initialise BullMQ `Worker` with `concurrency: config.concurrency`, `lockDuration: config.visibilityTimeout * 1_000`, `stalledInterval: config.stalledInterval`, `maxStalledCount: 1`
  - [ ] 7.3 Wire BullMQ `'completed'` event: emit `job.completed` on the `EventEmitter`; call `queue.clean(retentionMs, 1000, 'completed')` to schedule auto-clean
  - [ ] 7.4 Wire BullMQ `'failed'` event: if `error instanceof NonRetryableError` OR `job.attemptsMade >= config.maxAttempts` call `DLQHandler.moveToDLQ(job, error)`; otherwise allow BullMQ to schedule retry using `calculateDelay(job.attemptsMade, config.backoff)` via the custom backoff strategy
  - [ ] 7.5 Wire BullMQ `'stalled'` event: emit `job.stalled` event with `{ jobId: job.id, queueName }` for Prometheus and log observability
  - [ ] 7.6* Write unit tests with mocked BullMQ: simulate `completed` event and assert `job.completed` emitted; simulate `failed` event at `attemptsMade === maxAttempts` and assert `DLQHandler.moveToDLQ` called exactly once; simulate `failed` below `maxAttempts` and assert `moveToDLQ` not called; simulate `NonRetryableError` and assert `moveToDLQ` called regardless of `attemptsMade`
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R3.1, R3.4, R6.4, R6.5_

- [ ] 8. DLQ Handler and Repository
  - [ ] 8.1 Implement `DLQHandler.moveToDLQ(job: BullMQJob, error: Error): Promise<void>` in `src/queue/dlq/dlqHandler.ts`: call `job.moveToFailed(error, token, true)`, build `DLQEntry` (error history capped at 10), call `DLQRepository.create(entry)`, emit `job.dead_lettered` event
  - [ ] 8.2 Implement `DLQHandler.replay(dlqEntryId: string): Promise<{ newJobId: string }>`: load `DLQEntry` from `DLQRepository`, call `QueueProducer.enqueue()` with original payload and `maxAttempts` reset, update entry `status` to `replayed`
  - [ ] 8.3 Implement `DLQHandler.discard(dlqEntryId: string): Promise<void>`: load entry, verify it exists (throw 404-mapped error if not), delete the Redis hash, update `status` to `discarded`
  - [ ] 8.4 Implement `DLQRepository` in `src/queue/dlq/dlqRepository.ts`: `create(entry)`, `findById(id)`, `list(filters, pagination)`, `updateStatus(id, status, fields)` using ioredis hashes at key `dlq:{queueName}:{id}` with TTL = `dlqRetentionMs`
  - [ ] 8.5* Write unit tests: `moveToDLQ` emits `job.dead_lettered`; error history with 11 entries drops the oldest and retains 10; `replay` calls `producer.enqueue` with `attemptsMade: 0`; `discard` deletes the Redis hash
  - [ ] 8.6* Write integration tests against Testcontainers Redis: enqueue job with `maxAttempts: 1` and always-failing handler; assert `GET /jobs/dlq` returns the entry; call `POST /jobs/dlq/:id/replay` with a now-succeeding handler; assert new job completes and `DLQEntry.status === 'replayed'`
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [ ] 9. Graceful Shutdown
  - [ ] 9.1 Register SIGTERM signal handler in `src/queue/workers/jobWorker.ts` that calls `this.stop()`
  - [ ] 9.2 Implement `JobWorker.stop(): Promise<void>`: call `worker.pause(true)` to halt polling; use `Promise.race([allJobsDone, sleep(shutdownTimeoutMs)])` to wait for in-flight jobs; if all jobs complete first, call `worker.close()` and return (allowing `process.exit(0)`)
  - [ ] 9.3 IF the sleep wins the race, log a structured `warn` listing each stalled `jobId`, call `job.moveToFailed(new Error('shutdown timeout'), token, false)` for each active job, call `worker.close()`, then `process.exit(1)`
  - [ ] 9.4* Write integration test: start a worker with a 5-second sleep handler, enqueue a job, send `process.kill(process.pid, 'SIGTERM')` after 1 s, assert job completes and process resolves cleanly within 10 s
  - [ ] 9.5* Write timeout test: set `shutdownTimeoutMs: 300`, handler sleeps 10 s, send SIGTERM, assert process exits with code 1 and the structured log warning contains the correct `jobId`
  - _Requirements: R6.1, R6.2, R6.3, R6.5_

- [ ] 10. Job Status API
  - [ ] 10.1 Implement `GET /jobs/:jobId` in `src/api/routes/jobs.ts`: call `BullMQQueue.getJob(jobId)`; if null return 404 `JOB_NOT_FOUND`; map BullMQ job fields to `JobStatusResponse` and return 200
  - [ ] 10.2 Implement `GET /jobs?queueName=&status=&page=&pageSize=`: validate and default `page` (1) and `pageSize` (20, max 100); call `Queue.getJobs([status], start, end)`; return 200 with paginated body
  - [ ] 10.3 Implement `GET /jobs/dlq?queueName=&page=&pageSize=`: call `DLQRepository.list(filters, pagination)`; return 200 with paginated body ordered by `deadLetteredAt DESC`
  - [ ] 10.4 Implement `POST /jobs/dlq/:jobId/replay`: call `DLQHandler.replay(jobId)`; return 200 `{ newJobId }`; return 404 `DLQ_ENTRY_NOT_FOUND` if entry not found
  - [ ] 10.5 Implement `DELETE /jobs/dlq/:jobId`: call `DLQHandler.discard(jobId)`; return 204; return 404 `DLQ_ENTRY_NOT_FOUND` if not found
  - [ ] 10.6* Write API integration tests: assert all fields present in `GET /jobs/:id` for each lifecycle state; assert 404 for unknown ID; assert `pageSize` capped at 100; assert DLQ list returns entries newest first; assert replay returns `newJobId`
  - _Requirements: R4.3, R4.4, R4.5, R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

- [ ] 11. Observability
  - [ ] 11.1 Emit structured `pino` log events for: job enqueued, job acquired, job completed, job failed, job dead-lettered, graceful shutdown started, stall detected — each including `jobId`, `queueName`, `jobName`, and `attemptsMade`
  - [ ] 11.2 Register Prometheus metrics: `queue_jobs_enqueued_total{queue,job_name}` (Counter), `queue_jobs_completed_total{queue,job_name}` (Counter), `queue_jobs_failed_total{queue,job_name}` (Counter), `queue_jobs_dead_lettered_total{queue}` (Counter), `queue_job_duration_seconds{queue,job_name}` (Histogram, buckets: 0.1, 0.5, 1, 5, 30 s), `queue_active_jobs{queue}` (Gauge)
  - [ ] 11.3 Expose all Prometheus metrics on `GET /metrics` for scraping
  - _Requirements: R2.1, R3.1, R4.2, R6.2_

- [ ] 12. End-to-End Verification
  - [ ] 12.1 Start a full stack (QueueProducer + JobWorker + JobStatusAPI) against a Testcontainers Redis instance
  - [ ] 12.2 Enqueue 50 jobs across 3 queues with `concurrency: 5` workers; assert all reach `completed` within 30 s; confirm via `GET /jobs?status=completed`
  - [ ] 12.3 Enqueue 5 jobs with a handler that throws on attempts 1 and 2 and succeeds on attempt 3; assert each ends with `status: completed` and `attemptsMade: 3`
  - [ ] 12.4 Enqueue 5 jobs with `maxAttempts: 2` and an always-failing handler; assert all 5 appear in `GET /jobs/dlq`; replay 2 via `POST /jobs/dlq/:id/replay` with a now-succeeding handler; assert they complete
  - [ ] 12.5 Enqueue 20 concurrent calls with the same `idempotencyKey`; assert exactly 1 BullMQ job exists in Redis; assert all 20 calls return the same `jobId`; assert the handler executes exactly once
  - [ ] 12.6 Concurrency ceiling test: start a worker with `concurrency: 3`; enqueue 10 jobs each sleeping 500 ms; assert no more than 3 jobs are ever `active` simultaneously by polling `GET /jobs?status=active` every 100 ms
  - _Requirements: R1.1, R2.1, R3.1, R3.3, R4.4, R5.5, R6.1, R7.1_

- [ ] 13. Update Documentation
  - [ ] 13.1 Add JSDoc to `QueueProducer.enqueue()` documenting all `JobOptions` fields, return shape, and two `throws` tags (`JobSerializationError`, `QueueConnectionError`)
  - [ ] 13.2 Add JSDoc to `JobWorker.register()` with an example handler showing `job.updateProgress(n)` usage and correct `NonRetryableError` usage
  - [ ] 13.3 Add JSDoc to `calculateDelay()` with the formula, a worked example at attempt 3, and a note about the jitter distribution
  - [ ] 13.4 Add a `## Queue Reference` section to the project `README.md` covering: quick-start (enqueue + register handler in under 10 lines), config reference table, `NonRetryableError` usage guide, DLQ replay runbook, and Prometheus metrics list
  - _Requirements: R1.1, R2.1, R4.4, R7.1_

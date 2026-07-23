# Requirements Document

## Introduction

This document defines the requirements for a durable asynchronous background job queue for a Node.js/TypeScript service. The system enables application code to enqueue typed work items (jobs) without blocking the request path, and allows one or more long-running worker processes to consume and execute those jobs concurrently. It provides configurable retry logic with exponential backoff and jitter, a dead-letter queue (DLQ) for jobs that exhaust all retry attempts, idempotency key enforcement to prevent duplicate processing, visibility timeout-based locking to recover from worker crashes, concurrency control per worker process, graceful shutdown, and a queryable job status API. The backing store is Redis via BullMQ, providing durable persistence, atomic Lua-based operations, and multi-worker coordination.

## Glossary

- **Job**: A discrete unit of work identified by a UUID v4, carrying a typed name, a serialisable payload, and a lifecycle state (`waiting → active → completed | failed → dead-lettered`).
- **Producer**: Application code (HTTP handler, event listener, cron trigger) that calls `producer.enqueue()` to submit a job to a named queue. Producers do not wait for job completion.
- **Worker**: A long-running Node.js process (or pool thereof) that polls a named queue, acquires one job at a time under a visibility lock, and executes a registered handler function.
- **Job Handler**: An async function registered per job name that receives the typed payload and a BullMQ `Job` context object for updating progress and extending locks.
- **Idempotency Key**: A caller-supplied string attached to a job at enqueue time; if a non-failed, non-dead-lettered job with the same key already exists in the same queue, the system returns the existing job ID without inserting a duplicate.
- **Visibility Timeout**: The duration (in seconds) a worker has exclusive access to a job. If the worker neither completes the job nor heartbeats within this window, BullMQ's stall checker makes the job available for re-delivery.
- **Dead-Letter Queue (DLQ)**: A secondary BullMQ queue (`{queueName}:dlq`) that receives jobs that have exhausted all retry attempts, preserving them for operator inspection, replay, or discard.
- **Exponential Backoff**: A retry delay strategy: `delay(n) = min(baseDelay × 2^(n-1) + jitter, maxDelay)` where `jitter` is a uniform random integer in `[0, baseDelay]` ms.
- **Concurrency**: The maximum number of jobs a single worker process executes simultaneously, enforced by BullMQ's internal semaphore.
- **Graceful Shutdown**: Stopping new job acquisition while in-flight jobs are allowed to complete within a configurable deadline, after which remaining locks are released cleanly.
- **Stall Checker**: A BullMQ internal process that periodically identifies jobs whose visibility lock has expired without being released and re-queues them for re-delivery.
- **`NonRetryableError`**: An application error subclass that signals to the worker that a job should bypass all remaining retry attempts and move directly to the DLQ.

## Out of Scope

- Cron/scheduled job expression parsing (BullMQ's `repeat` option may be added independently).
- Priority queues beyond BullMQ's native numeric priority field.
- Workflow DAGs, fan-out/fan-in orchestration, or inter-job dependencies.
- Multi-broker routing across different Redis instances within a single job.
- Real-time WebSocket push of job status updates (polling the status API is the intended pattern).
- GUI dashboards for queue management (Bull Board may be added as a separate optional service).

## Requirements

### Requirement 1: Job Enqueuing

**User Story:** As a backend service, I want to enqueue a typed job with an optional idempotency key and delay, so that work is deferred to a worker without blocking the request path.

#### Acceptance Criteria

1. WHEN `producer.enqueue(queueName, jobName, payload, options?)` is called with a non-empty `queueName`, a registered `jobName`, and a JSON-serialisable payload THE SYSTEM SHALL add the job to the BullMQ queue under the key pattern `bull:{queueName}:waiting`, assign it a unique UUID v4 job ID, set its status to `waiting`, record `enqueuedAt` as the current UTC timestamp, and return the `jobId` to the caller within 50 ms at p95.
2. WHEN `options.idempotencyKey` is supplied and a job with the same key exists in the same queue in `waiting`, `active`, or `completed` state THE SYSTEM SHALL return the existing `jobId` without inserting a new BullMQ job record.
3. IF `options.idempotencyKey` is supplied and the matching existing job is in `failed` or `dead-lettered` state THEN THE SYSTEM SHALL insert a new job as if no prior record existed, allowing a corrected or retried enqueue to proceed.
4. WHERE `options.delayMs` (a non-negative integer) is provided THE SYSTEM SHALL schedule the job for delivery no earlier than `enqueuedAt + delayMs` milliseconds; the job SHALL appear in `waiting` state with a `scheduledFor` field set to the earliest delivery timestamp.
5. WHEN the job payload cannot be serialised to JSON (e.g. contains `BigInt`, circular references, or `undefined` top-level values) THE SYSTEM SHALL throw a `JobSerializationError` synchronously before contacting Redis, leaving no partial state in the queue.
6. IF Redis is unreachable when `enqueue()` is called THEN THE SYSTEM SHALL throw a `QueueConnectionError` with property `isRetryable: true` and SHALL NOT silently discard the job; callers may inspect `isRetryable` to implement their own fallback enqueue strategy.

### Requirement 2: Worker Processing and Concurrency Control

**User Story:** As a platform operator, I want workers to process jobs concurrently up to a configured limit and hold exclusive visibility locks, so that the same job is never processed twice simultaneously.

#### Acceptance Criteria

1. WHEN a worker is instantiated with `concurrency: N` THE SYSTEM SHALL process at most N jobs simultaneously within that process; additional jobs SHALL remain in `waiting` state until an active slot is freed by a job completing or failing.
2. WHEN a worker acquires a job THE SYSTEM SHALL atomically set the job's status to `active`, record `startedAt`, and hold a BullMQ lock in Redis at key `bull:{queueName}:{jobId}:lock` for `visibilityTimeout` seconds; no other worker instance SHALL acquire the same job while the lock is held.
3. WHILE a job handler is running and fewer than 10 seconds remain on the lock THE SYSTEM SHALL automatically extend the lock by another `visibilityTimeout` seconds (heartbeat renewal) without requiring handler code to call any method explicitly.
4. WHEN the job handler resolves successfully THE SYSTEM SHALL set the job status to `completed`, record `completedAt`, store the handler's resolved value as `result` (serialised to JSON, truncated to 4 096 bytes if larger), and release the lock atomically.
5. WHEN the job handler throws any error that is not an instance of `NonRetryableError` THE SYSTEM SHALL set the job status to `failed`, increment `attemptsMade` by 1, record the error's `message` and `stack` in `lastError`, and schedule the next retry according to the backoff configuration without moving the job to the DLQ yet.
6. IF a worker process is killed by SIGKILL while holding a job lock THEN THE SYSTEM SHALL recover the job automatically when the lock's TTL expires and BullMQ's stall checker runs (within `stalledInterval` seconds, default 30 s), making the job available for re-delivery to another worker without operator intervention.

### Requirement 3: Retries with Exponential Backoff

**User Story:** As a backend developer, I want failed jobs to be retried automatically with exponential backoff and random jitter, so that transient downstream failures are recovered without manual intervention and without causing thundering-herd re-delivery spikes.

#### Acceptance Criteria

1. WHEN a job fails and `attemptsMade < maxAttempts` THE SYSTEM SHALL schedule the next attempt with delay `min(baseDelay × 2^(attemptsMade - 1) + jitter, maxDelay)` milliseconds, where `jitter` is a uniform random integer in `[0, baseDelay]` ms, `baseDelay` defaults to 1 000 ms, and `maxDelay` defaults to 30 000 ms.
2. WHEN a job is awaiting its next retry THE SYSTEM SHALL set its status to `waiting` with a `scheduledFor` timestamp in the future; workers SHALL NOT acquire it before that timestamp has elapsed.
3. WHERE `maxAttempts` is configured per job (default 5) THE SYSTEM SHALL allow up to `maxAttempts` total execution attempts (the original attempt counts as attempt 1); once `attemptsMade` equals `maxAttempts` on the final failure the job SHALL be moved to the DLQ.
4. WHEN a handler throws an instance of `NonRetryableError` THE SYSTEM SHALL skip all remaining retry attempts and move the job directly to the DLQ, recording `attemptsMade` at its current value and preserving the full `lastError`; no further attempts SHALL be scheduled.
5. IF a job's computed retry delay exceeds `maxDelay` THE SYSTEM SHALL cap the delay at `maxDelay` for that attempt and continue incrementing `attemptsMade` normally; the cap is applied per attempt, not accumulated across attempts.
6. WHEN a job is retried THE SYSTEM SHALL preserve the original `idempotencyKey`, `payload`, `jobName`, and `queueName` unchanged; only `attemptsMade`, `lastError`, `startedAt`, and `scheduledFor` SHALL be updated between attempts.

### Requirement 4: Dead-Letter Queue

**User Story:** As a platform operator, I want exhausted jobs moved to a dead-letter queue with full diagnostic context, so that I can inspect failures, remediate the root cause, and replay affected jobs without permanent data loss.

#### Acceptance Criteria

1. WHEN a job's `attemptsMade` reaches `maxAttempts` after a final failure THE SYSTEM SHALL atomically move it to the DLQ queue `{queueName}:dlq`, set its status to `dead-lettered`, record `deadLetteredAt` as the current UTC timestamp, and preserve the full original payload, up to 10 historical error messages (oldest dropped when the limit is reached), and `attemptsMade`.
2. WHEN a job is moved to the DLQ THE SYSTEM SHALL emit a `job.dead_lettered` event containing `jobId`, `queueName`, `jobName`, `attemptsMade`, and `deadLetteredAt` so that alerting integrations (e.g. Slack, PagerDuty) can fire notifications.
3. WHEN `GET /jobs/dlq` is called with optional query params `?queueName=&page=&pageSize=` THE SYSTEM SHALL return a paginated list of DLQ entries ordered by `deadLetteredAt DESC`, with `pageSize` defaulting to 20 and capped at 100.
4. WHEN `POST /jobs/dlq/:jobId/replay` is called THE SYSTEM SHALL re-enqueue the DLQ job as a brand-new job on its original queue with `attemptsMade` reset to 0, update the DLQ entry's status to `replayed`, record `replayedAt` and the new `replayedJobId`, and return the new `jobId` in the response body.
5. WHEN `DELETE /jobs/dlq/:jobId` is called THE SYSTEM SHALL permanently remove the DLQ entry from Redis and return HTTP 204; THE SYSTEM SHALL NOT re-enqueue the job.
6. IF a job is `active` (lock held by a worker) when its `attemptsMade` reaches `maxAttempts` on final failure THEN THE SYSTEM SHALL complete the move to `dead-lettered` inside a BullMQ Lua script transaction to prevent a race condition where the stall checker concurrently re-queues the job.

### Requirement 5: Idempotency Keys

**User Story:** As a backend service, I want to supply an idempotency key at enqueue time so that network retries, duplicate HTTP requests, or at-least-once event bus deliveries never cause the same job to be executed more than once.

#### Acceptance Criteria

1. WHEN a job is enqueued with `options.idempotencyKey = "k"` THE SYSTEM SHALL atomically set a Redis key `iq:{queueName}:{k}` to the `jobId` using `SET NX PX {ttlMs}` with a TTL equal to `options.idempotencyTtlMs` (default 86 400 000 ms / 24 hours).
2. WHEN a subsequent enqueue call arrives with the same `queueName` and `idempotencyKey` before the TTL expires THE SYSTEM SHALL retrieve the `jobId` from `iq:{queueName}:{k}` and return it without calling BullMQ's `queue.add()`.
3. WHEN the existing job identified by the idempotency key has status `completed` THE SYSTEM SHALL return the original `jobId` and, if available, include the cached `result` in the enqueue response so callers can retrieve the outcome without a separate status query.
4. IF the idempotency key's Redis TTL has elapsed THEN THE SYSTEM SHALL treat the call as a new job and generate a fresh `jobId`; callers are responsible for choosing a `idempotencyTtlMs` value that spans their maximum expected retry window.
5. WHERE two concurrent enqueue calls arrive with the same `idempotencyKey` within the same millisecond THE SYSTEM SHALL rely on the `SET NX` atomicity guarantee to ensure exactly one call creates the idempotency record and the other receives the already-stored `jobId`; no duplicate BullMQ job SHALL be created.

### Requirement 6: Graceful Shutdown and Stall Recovery

**User Story:** As a DevOps engineer, I want workers to shut down gracefully on SIGTERM, completing or releasing in-flight jobs within a configurable deadline, so that rolling deployments and auto-scaling events do not cause job data loss or duplicate processing.

#### Acceptance Criteria

1. WHEN a worker process receives SIGTERM THE SYSTEM SHALL immediately stop polling for new jobs, allow all currently in-flight handlers up to `shutdownTimeoutMs` (default 30 000 ms) to complete, then call `worker.close()` to release all BullMQ connections and exit with code 0.
2. WHEN `shutdownTimeoutMs` elapses and one or more in-flight jobs are still executing THE SYSTEM SHALL emit a structured warning log listing each stalled `jobId` and `jobName`, call `job.moveToFailed()` for each (making them available for re-delivery), and exit with code 1 to signal an unclean shutdown to the process supervisor.
3. WHILE the worker is in the graceful shutdown window THE SYSTEM SHALL continue sending heartbeat lock renewals for in-flight jobs, preventing BullMQ's stall checker from evicting jobs that are still making progress.
4. WHEN `options.visibilityTimeout` is configured for a queue (default 30 s) THE SYSTEM SHALL pass that value as BullMQ's `lockDuration` (converted to milliseconds) so the lock lifetime matches operator expectation.
5. IF a worker crashes without handling SIGTERM (e.g. OOM kill or SIGKILL) THE SYSTEM SHALL rely on BullMQ's stall checker polling at `stalledInterval` ms (default 30 000 ms) to detect and re-queue stalled jobs; no operator intervention SHALL be required for recovery.

### Requirement 7: Job Status Tracking

**User Story:** As a developer integrating with the queue, I want to query the current status and diagnostic data for any job by ID, so that I can build status UIs, detect stuck jobs, and confirm completion.

#### Acceptance Criteria

1. WHEN `GET /jobs/:jobId` is called with a valid `jobId` THE SYSTEM SHALL return a JSON body containing `jobId`, `queueName`, `jobName`, `status`, `payload`, `result` (if `completed`), `lastError` (if `failed` or `dead-lettered`), `attemptsMade`, `maxAttempts`, `enqueuedAt`, `startedAt`, `completedAt`, `deadLetteredAt`, `scheduledFor`, and `progress`.
2. WHEN `GET /jobs` is called with query params `?queueName=&status=&page=&pageSize=` THE SYSTEM SHALL return a paginated list of matching jobs with the same fields as the single-job response; `pageSize` defaults to 20 and is capped at 100.
3. IF a `jobId` does not exist in Redis (never existed, or cleaned up by BullMQ's auto-clean policy) THEN THE SYSTEM SHALL return HTTP 404 with body `{ "error": "JOB_NOT_FOUND", "jobId": "<id>" }`.
4. WHEN a job transitions to `completed` THE SYSTEM SHALL retain the BullMQ job record for `completedJobRetentionMs` (default 604 800 000 ms / 7 days) before BullMQ auto-cleans it; DLQ entries SHALL be retained for `dlqRetentionMs` (default 2 592 000 000 ms / 30 days).
5. WHILE a job is `active` THE SYSTEM SHALL expose a `progress` field (integer 0–100) in the status response that workers update by calling `job.updateProgress(n)` inside their handler; this field is 0 on `waiting` jobs and absent on `completed` and `dead-lettered` responses.
6. WHERE a job is in `waiting` state with a future `scheduledFor` timestamp THE SYSTEM SHALL include `scheduledFor` (ISO 8601 UTC) in the status response so callers can estimate when the job will next be picked up by a worker.

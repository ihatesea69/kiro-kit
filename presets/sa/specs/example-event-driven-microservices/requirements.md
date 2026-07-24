# Requirements Document

## Introduction

This document defines the requirements for an **AWS Event-Driven Microservices Architecture** that handles high-throughput, loosely coupled service-to-service communication using Amazon EventBridge, SQS, SNS, API Gateway (HTTP API), Lambda, and DynamoDB. The architecture replaces point-to-point REST integrations between services with a central custom event bus, enabling independent deployment, fan-out to multiple consumers, and durable delivery guarantees.

The deliverables of this specification are **architecture artifacts** — not application code. They include an infrastructure-as-code Terraform module set, Mermaid C4 and sequence diagrams, a draw.io AWS architecture diagram, Architecture Decision Records (ADRs) for the three key design choices, and a Well-Architected Framework review. A Well-Architected review gates sign-off before any production deployment.

## Glossary

| Term | Definition |
|------|-----------|
| Event Bus | An Amazon EventBridge custom event bus that receives, routes, and delivers domain events to registered targets via rules. |
| Event Envelope | The standardised JSON wrapper for every domain event, containing routing metadata (`source`, `detail-type`, `version`) and a typed `detail` payload. |
| Event Rule | An EventBridge rule that matches incoming events against a content-based filter pattern and forwards matching events to one or more targets. |
| Consumer | A downstream service (implemented as a Lambda function backed by an SQS queue) that receives events of a specific type from the event bus. |
| Fan-Out | A routing pattern where a single event published to the event bus is delivered to multiple independent consumers via separate EventBridge rules. |
| DLQ | Dead-Letter Queue; an SQS queue that receives messages that could not be processed successfully after all retry attempts are exhausted. |
| SQS Standard Queue | An Amazon SQS queue used as an EventBridge target to buffer events and decouple delivery rate from consumer processing throughput. |
| SNS Topic | An Amazon SNS topic used for broadcast fan-out to subscribers (email, Lambda, SQS) when a consumer must notify multiple downstream endpoints. |
| Idempotency Key | A unique string derived from `{event_id}:{consumer_id}` stored in DynamoDB to detect and skip duplicate event deliveries. |
| Single-Table Design | A DynamoDB table layout where multiple entity types share one table, differentiated by composite key patterns using `PK` and `SK` attributes. |
| GSI | Global Secondary Index; a DynamoDB index on alternate key attributes that supports additional access patterns without a full-table scan. |
| ADR | Architecture Decision Record; a short document capturing the context, decision, and consequences of a significant design choice. |
| Terraform Module | A self-contained, reusable Terraform configuration in `infra/terraform/modules/<name>/` that provisions a discrete set of AWS resources. |
| C4 Diagram | A hierarchical architecture diagram at four levels (Context, Container, Component, Code); this spec produces Context and Container levels. |

## Out of Scope

- Application business logic inside Lambda functions; this specification covers only infrastructure and the event contract schema.
- Authentication and authorisation of end-user API calls; API Gateway authorization (JWT/IAM) is handled separately by a security specification.
- Multi-region active-active deployment; this architecture targets a single AWS region with per-AZ redundancy.
- Event schema versioning and consumer migration for breaking schema changes.
- Cost optimisation tuning (Lambda memory/concurrency sizing) beyond default values.
- Kinesis Data Streams as an alternative transport; EventBridge + SQS is the chosen pattern (documented in ADR-001).

## Requirements

### Requirement 1: API Gateway HTTP API and Lambda Entry Point

**User Story:** As a back-end engineer, I want a managed HTTP API entry point backed by Lambda that publishes domain events to the EventBridge custom event bus, so that client services send a single REST call and the platform handles all downstream fan-out and delivery.

#### Acceptance Criteria

1. WHEN a client POSTs to `/events/{domain}/{action}` on the HTTP API, THE SYSTEM SHALL validate the request body against the event envelope schema (R3.1) using a Lambda request validator, reject malformed payloads with HTTP 400 and a structured error body, and forward valid events to the EventBridge custom event bus using `events:PutEvents`.
2. WHEN the Lambda function publishes an event to EventBridge, THE SYSTEM SHALL set `Source` to `com.example.{domain}`, `DetailType` to `{domain}.{action}`, `EventBusName` to the custom bus ARN from SSM Parameter Store (`/platform/event-bus/arn`), and include the full validated `detail` JSON object.
3. WHEN the EventBridge `PutEvents` call fails or returns a `FailedEntryCount > 0`, THE SYSTEM SHALL log the failure to CloudWatch Logs with the `event_id`, `source`, `detail-type`, and the EventBridge error code, and return HTTP 502 to the caller.
4. WHEN the API is deployed, THE SYSTEM SHALL enforce a throttling limit of 1 000 requests per second per stage using an API Gateway usage plan, and return HTTP 429 with a `Retry-After` header when the limit is exceeded.

---

### Requirement 2: EventBridge Custom Event Bus and Routing Rules

**User Story:** As a platform engineer, I want EventBridge rules to route events from the custom bus to the correct consumer SQS queues based on content-based filter patterns, so that each consumer receives only the events it subscribed to without polling or tight coupling.

#### Acceptance Criteria

1. WHEN an event arrives on the custom event bus, THE SYSTEM SHALL evaluate all EventBridge rules in the bus and deliver the event to every rule whose `EventPattern` matches the event's `source`, `detail-type`, and optional `detail` field values.
2. WHEN an EventBridge rule matches an event, THE SYSTEM SHALL deliver the event to the target SQS queue within 60 seconds of the `PutEvents` API call completing, using the standard EventBridge-to-SQS delivery path with a resource-based queue policy granting `sqs:SendMessage` to `events.amazonaws.com`.
3. WHEN an event does not match any rule on the custom bus, THE SYSTEM SHALL deliver the event to the catch-all dead-letter SQS queue (`platform-events-unmatched-dlq`) and emit a `UnmatchedEventCount` CloudWatch metric via a rule that forwards to a Lambda metric emitter.
4. WHEN a new consumer service is onboarded, THE SYSTEM SHALL require only a new Terraform `aws_cloudwatch_event_rule` and `aws_cloudwatch_event_target` resource referencing the existing custom bus ARN, with no changes to the producer service or the event bus itself.

---

### Requirement 3: Event Envelope Schema and Validation

**User Story:** As a platform engineer, I want every domain event to conform to a versioned envelope schema with mandatory routing and tracing fields, so that consumers can process events without parsing varied ad-hoc payloads and operations can trace events across services.

#### Acceptance Criteria

1. WHEN any service publishes an event, THE SYSTEM SHALL require the `detail` object to include: `event_id` (UUID v4), `event_version` (semver string, e.g., `"1.0.0"`), `occurred_at` (ISO 8601 UTC timestamp), `correlation_id` (UUID v4, propagated from the originating API request), `producer` (service name string), and a `payload` object containing the domain-specific data.
2. WHEN an event's `event_version` major version differs from the consumer's registered schema major version, THE SYSTEM SHALL route the event to the `platform-events-schema-mismatch-dlq` queue and emit a `SchemaMismatchCount` CloudWatch metric.
3. WHEN events are published, THE SYSTEM SHALL emit a CloudWatch EMF (Embedded Metrics Format) log entry per event containing `source`, `detail-type`, `event_version`, and `correlation_id`, enabling per-event-type throughput dashboards in CloudWatch.

---

### Requirement 4: SQS Queues with DLQs for Consumer Buffering

**User Story:** As a back-end engineer, I want each consumer to receive events through a dedicated SQS standard queue with a configured DLQ, so that event delivery is durable, consumers can process at their own pace, and poison messages are isolated without blocking the queue.

#### Acceptance Criteria

1. WHEN a consumer SQS queue is provisioned, THE SYSTEM SHALL configure a `redrive_policy` with `maxReceiveCount: 3` pointing to a paired DLQ, so that a message moved to the DLQ after 3 failed processing attempts is retained for 14 days for inspection and replay.
2. WHEN a Lambda consumer fails to process a message (unhandled exception or timeout), THE SYSTEM SHALL allow SQS to redeliver the message up to `maxReceiveCount` times using the SQS visibility timeout (default 300 seconds) before routing it to the DLQ; the Lambda function must NOT delete the message on failure.
3. WHEN a message arrives in any consumer DLQ, THE SYSTEM SHALL trigger a CloudWatch alarm (`DLQMessageCount >= 1` for 1 evaluation period) that publishes to an `ops-alerts` SNS topic, which delivers an email notification to the on-call distribution list.
4. WHEN a message is replayed from the DLQ back to the main queue (via AWS CLI or the DLQ replay Lambda), THE SYSTEM SHALL preserve the original `MessageAttributes` including `event_id` and `correlation_id` so that idempotency checks (R5.1) can detect and skip already-processed events.

---

### Requirement 5: Idempotent Event Processing and DynamoDB State

**User Story:** As a back-end engineer, I want each consumer Lambda to record processed event IDs in DynamoDB with a TTL, so that duplicate deliveries (from SQS at-least-once semantics or DLQ replays) are detected and skipped without side effects.

#### Acceptance Criteria

1. WHEN a Lambda consumer receives an SQS message, THE SYSTEM SHALL attempt a conditional `PutItem` on the `IdempotencyKeys` item type in the DynamoDB events table using `PK = IDEM#{consumer_id}` and `SK = {event_id}`, with a condition expression `attribute_not_exists(PK)`, before executing any business logic; if the condition fails (event already processed), THE SYSTEM SHALL delete the SQS message and return without executing the handler.
2. WHEN an idempotency record is written successfully, THE SYSTEM SHALL set the DynamoDB item's `ttl` attribute to the current epoch time plus 86 400 seconds (24 hours) so that DynamoDB TTL automatically removes expired records.
3. WHEN multiple SQS messages for the same event arrive concurrently at a Lambda consumer (due to SQS at-least-once delivery), THE SYSTEM SHALL rely on DynamoDB's conditional write to resolve the race — only the first writer proceeds; subsequent writers see a `ConditionalCheckFailedException` and discard the duplicate.
4. WHEN the DynamoDB `PutItem` call fails with a transient error (e.g., `ProvisionedThroughputExceededException`), THE SYSTEM SHALL propagate the exception to SQS (by not deleting the message), allowing SQS to redeliver after the visibility timeout without double-processing.

---

### Requirement 6: SNS Fan-Out for Multi-Subscriber Notifications

**User Story:** As a platform engineer, I want select high-volume events to fan out to an SNS topic so that multiple downstream subscribers — other SQS queues, email endpoints, and third-party webhooks — can all receive a copy of the event without the publisher knowing the subscriber list.

#### Acceptance Criteria

1. WHEN an EventBridge rule targeting an SNS topic matches an event, THE SYSTEM SHALL deliver the event to the SNS topic using an `aws_cloudwatch_event_target` with an `input_transformer` that maps the EventBridge event envelope fields to an SNS message body conforming to the event envelope schema (R3.1).
2. WHEN an SNS topic delivers a message to an SQS subscriber, THE SYSTEM SHALL configure the SQS queue's `raw_message_delivery` attribute as `true` so that consumers receive the original event envelope JSON without an SNS notification wrapper, keeping the consumer parsing logic identical regardless of whether the event arrived via EventBridge-to-SQS or EventBridge-to-SNS-to-SQS.
3. WHEN an SNS delivery to a subscriber fails after all SNS retry attempts (3 retries over 20 minutes), THE SYSTEM SHALL route the failed delivery to the SNS topic's dead-letter queue (`{topic-name}-dlq`) configured via `aws_sns_topic_subscription` `redrive_policy`.

---

### Requirement 7: Terraform Module Set and Infrastructure-as-Code Conventions

**User Story:** As a platform engineer, I want the entire event-driven infrastructure defined in reusable Terraform modules under `infra/terraform/modules/`, so that each environment (sandbox, staging, production) instantiates the same modules with environment-specific variable overrides and no manual console changes are needed.

#### Acceptance Criteria

1. WHEN a Terraform plan is executed against any environment workspace, THE SYSTEM SHALL produce a plan with no manual resource imports required, meaning all resources are managed by the module set: `modules/api` (API Gateway + Lambda), `modules/events` (EventBridge bus + rules), `modules/queues` (SQS standard queues + DLQs + alarms), and `modules/tables` (DynamoDB table + GSIs).
2. WHEN `terraform validate` and `tflint --module` are run on the module set, THE SYSTEM SHALL produce zero errors and zero warnings, using `tflint-ruleset-aws` version `>=0.27` with rules for deprecated resource arguments and missing required tags.
3. WHEN `checkov --directory infra/terraform/` is run, THE SYSTEM SHALL pass all `HIGH` and `CRITICAL` severity checks including: SQS encryption at rest (`CKV_AWS_27`), DynamoDB encryption (`CKV_AWS_28`), Lambda not publicly exposed (`CKV_AWS_45`), and API Gateway access logging enabled (`CKV_AWS_76`).
4. WHEN any Terraform module is applied, THE SYSTEM SHALL tag every provisioned resource with at minimum: `Environment`, `Project`, `ManagedBy = "terraform"`, and `Owner` — enforced via a `default_tags` block in the `aws` provider and validated by a `checkov` custom policy.

---

### Requirement 8: Observability — Tracing, Metrics, and Dashboards

**User Story:** As a platform engineer, I want end-to-end distributed tracing with AWS X-Ray and a CloudWatch dashboard covering the full event pipeline, so that I can identify bottlenecks, measure consumer lag, and set SLO-based alarms across all services.

#### Acceptance Criteria

1. WHEN a Lambda function processes an event, THE SYSTEM SHALL emit an X-Ray trace segment with subsegments for the DynamoDB idempotency check, the business logic handler, and any downstream AWS API calls, with the original `correlation_id` propagated as a trace annotation using `xray.AddAnnotation("correlation_id", ...)`.
2. WHEN the CloudWatch dashboard `EventPipelineDashboard` is rendered, THE SYSTEM SHALL display: API Gateway request count and p99 latency, EventBridge `MatchedEvents` and `ThrottledRules` per rule, SQS `ApproximateNumberOfMessagesVisible` and `NumberOfMessagesSentToDLQ` per consumer queue, Lambda `Errors` and `Duration` p99 per function, and DynamoDB `ConsumedWriteCapacityUnits`.
3. WHEN the SQS `ApproximateNumberOfMessagesVisible` metric for any consumer queue exceeds 500 messages for 5 consecutive minutes, THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to the `ops-alerts` SNS topic (the same topic used by R4.3), enabling a combined alert channel for queue depth and DLQ events.

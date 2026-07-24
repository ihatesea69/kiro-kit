# Implementation Plan: AWS Event-Driven Microservices Architecture

## Overview

This plan produces architecture artifacts — diagrams, Terraform modules, ADRs, a Well-Architected review, and documentation deliverables — in dependency order: event envelope design, Terraform module scaffolding, EventBridge/SQS/DynamoDB modules, diagram generation, ADRs, static analysis gates, sandbox deployment and integration verification, and final documentation. Sub-tasks marked `- [ ]*` are test/validation tasks that must pass before the artifact is considered complete. Estimated effort: 5–7 engineer-days for a single solutions architect.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Event envelope schema and DynamoDB access-pattern design
  - [ ] 1.1 Draft the event envelope JSON schema in `docs/architecture/event-envelope-schema.json` (JSON Schema draft 2020-12): define required properties `event_id` (format: uuid), `event_version` (pattern: semver), `occurred_at` (format: date-time), `correlation_id` (format: uuid), `producer` (type: string), `payload` (type: object); add `$defs` for `OrderPlacedPayload` and `PaymentAuthorisedPayload` as example domain payloads.
  - [ ] 1.2 Document DynamoDB single-table access patterns in `docs/architecture/dynamodb-access-patterns.md`: produce the entity-type / PK / SK / GSI table matching the design; annotate each row with the consuming service and estimated read/write frequency; confirm no access pattern requires a full-table scan.
  - [ ] 1.3 Create `docs/architecture/` directory with `.gitkeep`; add `CODEOWNERS` entry pointing the directory to the SA team.
  - _Requirements: R3.1, R5.1, R5.2_

- [ ] 2. Terraform module scaffolding and provider configuration
  - [ ] 2.1 Create the module directory tree: `infra/terraform/modules/{api,events,queues,tables}/`, `infra/terraform/environments/{sandbox,staging,production}/`; add `infra/terraform/.tflint.hcl` enabling `tflint-ruleset-aws` with `required_tags`, `aws_resource_missing_tags`, and `deprecated_resource` rules.
  - [ ] 2.2 Create `infra/terraform/modules/api/versions.tf` pinning: `required_version = ">= 1.7"`, `aws = "~> 5.50"`, `archive = "~> 2.4"`; repeat in each module's `versions.tf`.
  - [ ] 2.3 Add `infra/terraform/environments/sandbox/providers.tf` with the `aws` provider block, `default_tags` block (keys: `Environment`, `Project`, `ManagedBy`, `Owner`), and OIDC-based role assumption via `assume_role_with_web_identity`.
  - [ ]* 2.4 Run `terraform validate` in each module directory; assert zero errors.
  - _Requirements: R7.1, R7.2_

- [ ] 3. Terraform module: `api` (API Gateway HTTP API + Publisher Lambda)
  - [ ] 3.1 Implement `infra/terraform/modules/api/main.tf` with all resources shown in the design: `aws_apigatewayv2_api`, `aws_apigatewayv2_stage` (access logging + throttling), `aws_apigatewayv2_integration`, `aws_apigatewayv2_route`, `aws_lambda_function` (X-Ray active tracing, `EVENT_BUS_ARN` env var from `var.event_bus_arn`), `aws_iam_role` + `aws_iam_role_policy` (allow `events:PutEvents` on the bus ARN, `logs:CreateLogGroup` + `logs:CreateLogDelivery`, `xray:PutTraceSegments`).
  - [ ] 3.2 Implement `infra/terraform/modules/api/variables.tf` (all inputs documented with `description` and `type`), `outputs.tf` (`api_endpoint`, `entry_lambda_function_name`, `entry_lambda_arn`).
  - [ ] 3.3 Add `aws_cloudwatch_log_group` for API Gateway access logs and the publisher Lambda; set `retention_in_days = 30` for sandbox, `90` for production.
  - [ ]* 3.4 Run `tflint --module` on `modules/api/`; assert zero warnings. Run `checkov -d infra/terraform/modules/api/`; assert no HIGH/CRITICAL failures (CKV_AWS_76 access logging, CKV_AWS_45 Lambda not public).
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R7.1, R7.2, R7.3, R7.4_

- [ ] 4. Terraform module: `events` (EventBridge bus + rules + targets)
  - [ ] 4.1 Implement `infra/terraform/modules/events/main.tf`: `aws_cloudwatch_event_bus` (custom bus), `aws_cloudwatch_event_bus_policy` (allow `events:PutEvents` from the publisher Lambda role ARN only), `aws_cloudwatch_event_rule` for `order.*`, `payment.*`, catch-all unmatched, and `order.placed` → SNS; `aws_cloudwatch_event_target` for each rule.
  - [ ] 4.2 Add an `input_transformer` block on the `order.placed` → SNS target that maps EventBridge envelope fields to the SNS message body per design.
  - [ ] 4.3 Implement `variables.tf` and `outputs.tf`; export `event_bus_arn` and `event_bus_name` so the `api` and `queues` modules can reference them.
  - [ ]* 4.4 Run `tflint --module` on `modules/events/`; assert zero warnings. Run `checkov -d infra/terraform/modules/events/`; assert zero HIGH/CRITICAL.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R6.1, R6.2, R7.1_

- [ ] 5. Terraform module: `queues` (SQS + DLQs + SNS + CloudWatch alarms)
  - [ ] 5.1 Implement `infra/terraform/modules/queues/main.tf` using `for_each` over `var.consumer_definitions`: create paired `aws_sqs_queue` (consumer) + `aws_sqs_queue` (DLQ) resources with `redrive_policy`, KMS encryption (`alias/aws/sqs`), and `aws_sqs_queue_policy` granting `sqs:SendMessage` to `events.amazonaws.com` (for EventBridge delivery).
  - [ ] 5.2 Add `aws_cloudwatch_metric_alarm` for DLQ depth (`ApproximateNumberOfMessagesVisible >= 1`) and consumer queue depth (`ApproximateNumberOfMessagesVisible >= 500` for 5 periods) per queue, both targeting `aws_sns_topic.ops_alerts`.
  - [ ] 5.3 Create `aws_sns_topic` (`order-placed-notifications`) with `aws_sns_topic_subscription` for each fan-out consumer SQS queue, setting `raw_message_delivery = true`.
  - [ ] 5.4 Create `aws_sns_topic` (`ops-alerts`) with an email subscription to `var.ops_email`; export its ARN.
  - [ ]* 5.5 Run `tflint --module` on `modules/queues/`; assert zero warnings. Run `checkov -d infra/terraform/modules/queues/`; assert no HIGH/CRITICAL (CKV_AWS_27 SQS encryption).
  - _Requirements: R4.1, R4.3, R6.2, R6.3, R8.3, R7.3, R7.4_

- [ ] 6. Terraform module: `tables` (DynamoDB single-table)
  - [ ] 6.1 Implement `infra/terraform/modules/tables/main.tf`: `aws_dynamodb_table` with `billing_mode = "PAY_PER_REQUEST"`, `hash_key = "PK"`, `range_key = "SK"`, GSI1 (`GSI1PK` / `GSI1SK`, `projection_type = "ALL"`), `ttl` block (`attribute_name = "ttl"`), `point_in_time_recovery` block (`enabled = var.enable_pitr`), `server_side_encryption` block (`enabled = true`).
  - [ ] 6.2 Add `aws_iam_policy_document` data sources and `aws_iam_policy` resources for consumer Lambda roles: allow `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem` scoped to the table ARN; allow `dynamodb:Query` on the GSI1 ARN.
  - [ ]* 6.3 Run `tflint --module` on `modules/tables/`; assert zero warnings. Run `checkov -d infra/terraform/modules/tables/`; assert no HIGH/CRITICAL (CKV_AWS_28 DynamoDB encryption, PITR enabled in production).
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R7.1, R7.3_

- [ ] 7. Mermaid diagrams via `mermaid-diagrams` skill
  - [ ] 7.1 Use the `mermaid-diagrams` skill to render `docs/architecture/system-context.mmd` (C4 Context diagram) and `docs/architecture/component-design.mmd` (component flowchart) into PNG exports at `docs/architecture/exports/system-context.png` and `exports/component-design.png`.
  - [ ] 7.2 Use the `mermaid-diagrams` skill to render `docs/architecture/event-flow-sequence.mmd` (order placed → fan-out sequence) into `docs/architecture/exports/event-flow-sequence.png`.
  - [ ]* 7.3 Validate all `.mmd` files with `mmdc --input <file> --output /dev/null`; assert zero parse errors.
  - _Requirements: R3.3_

- [ ] 8. draw.io AWS architecture diagram via `drawio-aws` skill
  - [ ] 8.1 Use the `drawio-aws` skill (or `drawio-ai generate`) to produce `docs/architecture/aws-architecture.drawio` showing: Producer → API Gateway → Lambda → EventBridge custom bus → (SQS consumer queues → Lambda consumers → DynamoDB) and (SNS topic → SQS email-notification queue); include DLQ connections as dashed arrows; use official AWS 2024 shape library icons.
  - [ ] 8.2 Export `aws-architecture.drawio` to `docs/architecture/exports/aws-architecture.png` at 150 DPI using `drawio-ai export`.
  - [ ]* 8.3 Run `drawio-ai validate docs/architecture/aws-architecture.drawio`; assert exit code 0 (no broken connectors, no floating shapes).
  - _Requirements: R7.1_

- [ ] 9. Architecture Decision Records
  - [ ] 9.1 Author `docs/architecture/adr-001-eventbridge-vs-sns-only.md` following the MADR template: sections Status, Context, Decision, Rationale, Consequences; content per the design ADR summary in `design.md`.
  - [ ] 9.2 Author `docs/architecture/adr-002-single-table-vs-multi-table.md` with single-table rationale, governance requirements, and migration trigger criteria.
  - [ ] 9.3 Author `docs/architecture/adr-003-sqs-buffering-vs-direct-lambda.md` with durability rationale, latency trade-off, and `ReportBatchItemFailures` design note.
  - _Requirements: R7.1_

- [ ] 10. End-to-end verification in sandbox
  - [ ] 10.1 Run `terraform -chdir=infra/terraform/environments/sandbox init && terraform plan -out=sandbox.tfplan`; assert the plan creates the expected resource count with no unexpected destroys; save plan summary to `docs/architecture/sandbox-plan-summary.txt`.
  - [ ] 10.2 Apply the sandbox plan (`terraform apply sandbox.tfplan`); assert all resources reach `CREATE_COMPLETE`; capture `terraform output -json > docs/architecture/sandbox-outputs.json`.
  - [ ] 10.3 Execute the smoke test: POST a valid `order.placed` envelope to the sandbox API endpoint (from `sandbox-outputs.json`); assert HTTP 200 and `event_id` in response body.
  - [ ] 10.4 Assert fan-out: poll `order-service-events` SQS queue using `aws sqs receive-message --queue-url <url> --wait-time-seconds 10`; assert message body's `detail.event_id` matches the published event.
  - [ ] 10.5 Assert idempotency: replay the same message to the consumer queue twice; query DynamoDB (`aws dynamodb get-item`) for `PK=IDEM#order-consumer`, `SK={event_id}`; assert item exists exactly once.
  - [ ] 10.6 Assert DLQ routing: publish an event with a deliberately missing `event_id`; wait for 3 SQS redelivery attempts (sandbox visibility timeout = 5 s); assert message appears in `order-service-events-dlq`.
  - [ ]* 10.7 Run `drawio-ai validate docs/architecture/aws-architecture.drawio`; assert exit code 0.
  - _Requirements: R1.1, R1.2, R2.1, R2.2, R4.1, R4.2, R5.1, R5.3_

- [ ] 11. Well-Architected review and documentation deliverables
  - [ ] 11.1 Complete `docs/architecture/well-architected-review.md` with a pillar-by-pillar assessment (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimisation, Sustainability); map each pillar to specific Terraform resources and design decisions; flag any open risks as `[RISK]` items with mitigation owners.
  - [ ] 11.2 Use the `architecture-doc` skill to produce `docs/architecture/sad.docx` — a System Architecture Document covering: executive summary, system context, component design (embedding the PNG exports from Tasks 7 and 8), event envelope schema, DynamoDB access-pattern table, ADR summaries, and WA review; verify the `.docx` opens without errors.
  - [ ] 11.3 Use the `architecture-deck` skill to produce `docs/architecture/architecture-deck.pptx` covering: problem statement and solution overview, system context diagram, event flow sequence, Terraform module structure, ADR summary slides, and WA review highlights; verify the `.pptx` opens without errors.
  - [ ] 11.4 Update `docs/system-architecture.md` to add the Event-Driven Microservices Platform as a component in the system landscape section, linking to `docs/architecture/sad.docx` and the draw.io diagram export.
  - _Requirements: R7.1, R8.1, R8.2_

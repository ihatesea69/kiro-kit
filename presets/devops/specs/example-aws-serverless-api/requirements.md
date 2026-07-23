# Requirements Document

## Introduction

This document specifies the requirements for a CRUD HTTP API built on the AWS serverless golden trio: **API Gateway (HTTP API) + AWS Lambda + Amazon DynamoDB**, provisioned end-to-end with the **AWS Cloud Development Kit (CDK)**. The API exposes four routes — Create, Read, Update, Delete — each backed by a single, dedicated Lambda function. All infrastructure is declared as TypeScript CDK constructs, synthesised to CloudFormation, and deployed through an automated pipeline.

The design prioritises operational best practices: one Lambda per route to eliminate the monolith anti-pattern; DynamoDB on-demand (PAY\_PER\_REQUEST) billing to avoid capacity planning; least-privilege IAM policies scoped to the exact DynamoDB actions each function requires; structured JSON logging and AWS X-Ray tracing on every function; and cold-start mitigation through minimal bundle sizes and Lambda provisioned concurrency on the hot path.

## Glossary

| Term | Definition |
|------|------------|
| HTTP API | An Amazon API Gateway v2 HTTP API — lower latency and cost than REST API; lacks usage plans and request validators by default |
| Lambda function | An AWS Lambda function; each route in this system maps to exactly one Lambda to avoid the monolith anti-pattern |
| DynamoDB table | An Amazon DynamoDB table configured with `BillingMode: PAY_PER_REQUEST` (on-demand); automatically scales read/write capacity |
| Partition key | The primary key attribute (`PK`) used to distribute items across DynamoDB partitions; must have high cardinality |
| CDK construct | A reusable abstraction in AWS CDK (L1 = CloudFormation resource, L2 = opinionated wrapper, L3 = pattern); this project uses L2 and L3 constructs |
| CDK stack | A unit of deployment in CDK; synthesises to a single CloudFormation stack; this project uses one stack per environment |
| Least-privilege IAM | Each Lambda execution role grants only the DynamoDB API actions that function actually calls (e.g. `dynamodb:GetItem` but not `dynamodb:PutItem` on read functions) |
| Cold start | The latency penalty when Lambda initialises a new execution environment; mitigated by small bundle sizes and optional provisioned concurrency |
| X-Ray trace | An AWS X-Ray distributed trace; Lambda emits a root segment automatically when `tracing: lambda.Tracing.ACTIVE` is set |
| Structured log | A JSON log line emitted to CloudWatch Logs via `aws-lambda-powertools/logger`; each line includes `level`, `service`, `function`, `requestId`, and domain fields |
| PAY\_PER\_REQUEST | DynamoDB billing mode where you pay per read/write request unit; no capacity planning required; recommended for unpredictable traffic |

## Out of Scope

- Authentication and authorisation (JWT authoriser, Cognito, API keys) — treated as a follow-on feature
- Multi-region active-active deployments
- DynamoDB Streams and event-driven processing
- Custom domain names and ACM certificate provisioning
- GraphQL or WebSocket APIs
- VPC placement of Lambda functions (not needed for a public HTTP API with no VPC dependencies)
- Manual deployment; all infrastructure changes must flow through the CDK pipeline

## Requirements

### Requirement 1: Single-Route Lambda Architecture

**User Story:** As a platform engineer, I want each API route backed by an independent Lambda function, so that functions can be deployed, scaled, and granted permissions individually without coupling unrelated business logic.

#### Acceptance Criteria

1. WHEN the CDK stack is synthesised, THE SYSTEM SHALL create exactly four Lambda functions — `CreateItemFunction`, `GetItemFunction`, `UpdateItemFunction`, and `DeleteItemFunction` — each mapping to a single API Gateway route (`POST /items`, `GET /items/{id}`, `PUT /items/{id}`, `DELETE /items/{id}`).
2. WHERE Lambda handler code is organised, THE SYSTEM SHALL place each handler in its own file under `lambda/handlers/` (e.g. `lambda/handlers/createItem.ts`) and bundle each independently using esbuild via `aws_lambda_nodejs.NodejsFunction` with `bundling.minify: true` and `bundling.sourceMap: true`.
3. WHEN a new version of one handler is deployed, THE SYSTEM SHALL NOT trigger a replacement or restart of any other handler's execution environments.
4. IF a Lambda function's handler file exceeds 1 MB after bundling (excluding the Lambda runtime), THE SYSTEM SHALL fail the CDK synth with a custom validation message listing the function name and actual bundle size.
5. WHEN the CDK stack is deployed, THE SYSTEM SHALL set `runtime: lambda.Runtime.NODEJS_20_X` and `architecture: lambda.Architecture.ARM_64` (Graviton2) on all four functions to reduce cost and cold-start duration.

### Requirement 2: DynamoDB Table with On-Demand Billing

**User Story:** As a backend engineer, I want a DynamoDB table with on-demand billing and a well-chosen partition key, so that the API can handle unpredictable traffic without manual capacity planning or hot-partition issues.

#### Acceptance Criteria

1. WHEN the CDK stack is synthesised, THE SYSTEM SHALL declare a single `dynamodb.Table` construct named `ItemsTable` with `partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING }`, `sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING }`, and `billingMode: dynamodb.BillingMode.PAY_PER_REQUEST`.
2. WHERE the DynamoDB table is declared, THE SYSTEM SHALL enable point-in-time recovery (`pointInTimeRecovery: true`) and server-side encryption with an AWS-managed key (`encryption: dynamodb.TableEncryption.AWS_MANAGED`).
3. WHEN a `GET /items/{id}` request is processed, THE SYSTEM SHALL call only `dynamodb:GetItem` against the table; if the item does not exist, THE SYSTEM SHALL return HTTP 404 with body `{ "error": "Item not found", "id": "<id>" }`.
4. IF a `PUT /items/{id}` request attempts to update an item whose `PK` does not match the authenticated caller's scope, THE SYSTEM SHALL return HTTP 403 without performing any DynamoDB write.
5. WHERE table names are referenced in Lambda environment variables, THE SYSTEM SHALL use `TABLE_NAME: table.tableName` so the CloudFormation-generated name is resolved at deploy time rather than hardcoded.

### Requirement 3: Least-Privilege IAM Execution Roles

**User Story:** As a security engineer, I want each Lambda function's execution role to grant only the DynamoDB actions that function actually invokes, so that a compromised function cannot read, write, or delete records beyond its intended scope.

#### Acceptance Criteria

1. WHEN the CDK stack synthesises IAM policies, THE SYSTEM SHALL grant `CreateItemFunction` only `dynamodb:PutItem` on the `ItemsTable` ARN; `GetItemFunction` only `dynamodb:GetItem`; `UpdateItemFunction` only `dynamodb:UpdateItem`; and `DeleteItemFunction` only `dynamodb:DeleteItem` — no function SHALL receive `dynamodb:*` or AWS managed policies such as `AmazonDynamoDBFullAccess`.
2. WHERE IAM policy statements are declared, THE SYSTEM SHALL scope the `Resource` to the exact table ARN (e.g. `table.tableArn`) and NOT to `arn:aws:dynamodb:*:*:table/*` or `*`.
3. WHEN Lambda functions require CloudWatch Logs access, THE SYSTEM SHALL rely on the CDK-generated `AWSLambdaBasicExecutionRole` automatically attached by `lambda.Function`; no additional log-group permissions SHALL be granted manually.
4. IF an IAM policy in the synthesised CloudFormation template contains a `Resource: "*"` statement on a DynamoDB action, THE SYSTEM SHALL fail the CDK synth with a custom aspect validation error naming the offending policy and function.
5. WHEN the stack is deployed to a production environment, THE SYSTEM SHALL enforce that no Lambda execution role has `iam:PassRole`, `iam:CreateRole`, or `iam:AttachRolePolicy` permissions, validated by a CDK `Aspects` check run during `cdk synth`.

### Requirement 4: API Gateway HTTP API Integration

**User Story:** As a backend engineer, I want a fully managed HTTP API in API Gateway wired to the four Lambda functions, so that the API is publicly reachable, handles CORS, and returns standard HTTP status codes for each operation.

#### Acceptance Criteria

1. WHEN the CDK stack is synthesised, THE SYSTEM SHALL create an `apigatewayv2.HttpApi` construct with `corsPreflight` configured to allow origins `['https://app.example.com']`, methods `[HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.OPTIONS]`, and headers `['Content-Type', 'Authorization']`.
2. WHEN a `POST /items` request body fails JSON schema validation, THE SYSTEM SHALL return HTTP 400 with body `{ "error": "Validation failed", "details": ["<field>: <reason>"] }` before any DynamoDB call is made.
3. WHEN a Lambda integration returns a 2xx response, THE SYSTEM SHALL pass the response body through unchanged; WHEN it returns a 4xx or 5xx, THE SYSTEM SHALL add the response header `X-Request-Id: <API Gateway request ID>` to aid client-side debugging.
4. WHERE the API Gateway endpoint URL is an output of the CDK stack, THE SYSTEM SHALL export it as `CfnOutput` with logical ID `ApiEndpoint` so downstream stacks and the deployment pipeline can reference it without hardcoding.
5. WHEN more than 500 requests per second hit the HTTP API, THE SYSTEM SHALL not require any manual intervention; API Gateway SHALL throttle excess requests at the account default (10,000 RPS burst) and Lambda SHALL scale concurrency automatically up to the reserved concurrency limit set in the CDK construct.

### Requirement 5: Cold-Start Mitigation

**User Story:** As a platform engineer, I want Lambda cold starts to remain below 800 ms on the critical read path, so that the first request after an idle period does not noticeably degrade user experience.

#### Acceptance Criteria

1. WHEN `GetItemFunction` is deployed to the `prod` environment, THE SYSTEM SHALL configure `provisionedConcurrentExecutions: 1` via a `lambda.Version` and `lambda.Alias` construct to keep at least one warm execution environment at all times.
2. WHERE Lambda handler code is bundled by esbuild, THE SYSTEM SHALL set `bundling.externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb']` to exclude the AWS SDK from the bundle (it is pre-installed in the Lambda runtime), reducing cold-start initialisation time.
3. WHEN a cold start occurs on any function, THE SYSTEM SHALL emit a structured log line with `"event": "cold_start", "isColdStart": true, "functionName": "<name>", "functionVersion": "<version>"` at `INFO` level via `aws-lambda-powertools/logger`.
4. IF the p99 initialisation duration (measured by the `Init Duration` field in CloudWatch Logs Insights) for any function exceeds 800 ms over a 24-hour window in prod, THE SYSTEM SHALL trigger a CloudWatch Alarm (`InitDurationAlarm`) with SNS notification to the `ops-alerts` topic.
5. WHILE provisioned concurrency is enabled on `GetItemFunction`, THE SYSTEM SHALL cost-allocate the charge by tagging the Lambda alias with `Environment: prod` and `BilledConcurrency: provisioned` using CDK `Tags.of(alias).add(...)`.

### Requirement 6: Structured Logging and X-Ray Tracing

**User Story:** As an SRE, I want every Lambda invocation to emit structured JSON logs and an X-Ray trace, so that I can correlate requests across functions and diagnose latency or errors without grepping unstructured text.

#### Acceptance Criteria

1. WHEN any Lambda function is invoked, THE SYSTEM SHALL emit at minimum one structured JSON log line containing `level`, `service`, `functionName`, `awsRequestId`, `correlationId` (from the `X-Amzn-Trace-Id` header), and an `event` field describing the operation (`"create_item"`, `"get_item"`, etc.).
2. WHERE Lambda functions are declared in CDK, THE SYSTEM SHALL set `tracing: lambda.Tracing.ACTIVE` on all four functions so AWS X-Ray automatically captures Lambda initialisation and invocation segments.
3. WHEN a DynamoDB call fails with any error, THE SYSTEM SHALL log the error at `ERROR` level with fields `errorType`, `errorMessage`, `tableName`, `operation`, and `itemId` (if applicable) and return an appropriate HTTP error response; the error SHALL also be captured as an X-Ray subsegment fault.
4. WHERE CloudWatch Log Groups are created by CDK for each Lambda, THE SYSTEM SHALL set `retention: logs.RetentionDays.THIRTY_DAYS` and `removalPolicy: cdk.RemovalPolicy.DESTROY` (for non-prod) or `cdk.RemovalPolicy.RETAIN` (for prod) to prevent orphaned log groups accumulating cost.
5. WHEN the X-Ray service map is viewed in the AWS Console, THE SYSTEM SHALL show a service graph connecting `API Gateway` → each of the four `Lambda` nodes → `DynamoDB`, with per-node latency and error rate percentiles visible without any manual instrumentation beyond the CDK `tracing` property.

### Requirement 7: Infrastructure Lifecycle and CDK Deployment

**User Story:** As a platform engineer, I want all AWS resources managed by a single CDK stack so that CloudFormation handles dependency ordering, drift detection, and safe teardown without manual resource deletion.

#### Acceptance Criteria

1. WHEN `cdk deploy` is run for the first time, THE SYSTEM SHALL create all resources in dependency order — DynamoDB table first, then Lambda execution roles referencing the table ARN, then Lambda functions referencing the roles, then API Gateway routes referencing the Lambda ARNs — without requiring any manual sequencing.
2. WHEN `cdk diff` is run before a deployment, THE SYSTEM SHALL output the exact set of CloudFormation resource changes (additions, modifications, deletions) and exit with code 0 if no changes are detected or code 1 if changes are present, enabling pipeline gates.
3. IF a `cdk destroy` command is run on the `prod` stack, THE SYSTEM SHALL require the operator to pass `--require-approval broadening` and the DynamoDB table SHALL have `removalPolicy: cdk.RemovalPolicy.RETAIN` so data is not deleted automatically.
4. WHEN the CDK stack is deployed to multiple environments (`dev`, `staging`, `prod`), THE SYSTEM SHALL derive environment-specific values (account ID, region, DynamoDB table suffix, provisioned concurrency toggle) from CDK context keys (`-c environment=prod`) rather than from separate stack files.
5. WHERE the CDK stack defines resource names, THE SYSTEM SHALL NOT use `physicalName` overrides that would prevent CloudFormation from replacing resources on breaking changes; instead, THE SYSTEM SHALL allow CloudFormation to generate names and export ARNs as `CfnOutput` values.

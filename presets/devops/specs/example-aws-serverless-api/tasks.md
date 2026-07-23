# Implementation Plan: AWS Serverless API

## Overview

This plan delivers the CRUD HTTP API across five incremental phases. Each phase produces a verifiable artifact — a passing CDK synth, a deployed stack, or an end-to-end test run — before the next phase begins. Tasks within a phase that share no file dependency may run in parallel.

Traceability tags use the format `R<N>.<AC>` where `N` is the Requirement number and `AC` is the Acceptance Criterion number from `requirements.md`.

## Tasks

- [ ] 1. Project Scaffold and CDK Foundation
  - [ ] 1.1 Initialise the CDK project with `cdk init app --language=typescript`; set `"@aws-cdk/core:enablePartitionLiterals": true` and `"@aws-cdk/aws-lambda:recognizeLayerVersion": true` in `cdk.json`; add context keys `dev`, `staging`, `prod` each containing `account`, `region`, and `provisionedConcurrency` (false/false/true)
  - [ ] 1.2 Add dependencies: `aws-cdk-lib`, `constructs`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `aws-lambda-powertools` (logger + tracer); add dev dependencies: `vitest`, `@types/aws-lambda`, `esbuild`
  - [ ] 1.3 Create `bin/app.ts`: read `environment` from `app.node.tryGetContext('environment')`; throw if undefined; instantiate `ServerlessApiStack` with `env: { account, region }` from context
  - [ ] 1.4 Create `lib/serverless-api-stack.ts` as an empty `cdk.Stack` subclass; add `Aspects.of(this).add(new NoDynamoWildcard())` placeholder
  - [ ] 1.5 Run `cdk synth -c environment=dev` and confirm it exits 0 and produces an empty CloudFormation template with no resources
  - _Requirements: R7.1, R7.4_

- [ ] 2. DynamoDB Table and Lambda Constructs
  - [ ] 2.1 Create `lib/constructs/items-table.ts` implementing `ItemsTableConstruct`: `dynamodb.Table` with `PK` (STRING) partition key, `SK` (STRING) sort key, `billingMode: BillingMode.PAY_PER_REQUEST`, `pointInTimeRecovery: true`, `encryption: TableEncryption.AWS_MANAGED`, and removal policy derived from `isProd` context value
  - [ ] 2.2 Create `lib/constructs/lambda-function.ts` implementing the `createHandler` factory: `NodejsFunction` with `runtime: Runtime.NODEJS_20_X`, `architecture: Architecture.ARM_64`, `tracing: Tracing.ACTIVE`, `bundling: { minify: true, sourceMap: true, externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'] }`, `logRetention: RetentionDays.THIRTY_DAYS`
  - [ ] 2.3 Create `lib/aspects/no-wildcard-dynamo.ts` implementing `NoDynamoWildcard` as a CDK `IAspect`; iterate all `iam.CfnPolicy` nodes; throw if any DynamoDB action is paired with `Resource: "*"`
  - [ ] 2.4 Instantiate `ItemsTableConstruct` in `ServerlessApiStack`; add `NoDynamoWildcard` aspect; run `cdk synth -c environment=dev` and confirm the DynamoDB table appears in the template with `BillingMode: PAY_PER_REQUEST` and `PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled: true`
  - [ ] 2.5 Write CDK unit test in `test/serverless-api-stack.test.ts`: assert `Template.fromStack(stack).resourceCountIs('AWS::DynamoDB::Table', 1)` and `hasResourceProperties` for `BillingMode`, `PointInTimeRecoveryEnabled`, `SSESpecification`
  - [ ]* Validate: `npx vitest run test/serverless-api-stack.test.ts` exits 0; `cdk synth -c environment=dev` exits 0 with no NoDynamoWildcard violations
  - _Requirements: R2.1, R2.2, R3.4, R7.1, R7.3_

- [ ] 3. Lambda Handlers and IAM Grants
  - [ ] 3.1 Create `lambda/shared/ddb-client.ts`: initialise `DynamoDBClient` and `DynamoDBDocumentClient` outside the handler function so the client is reused across warm invocations; read region from `AWS_REGION` env var
  - [ ] 3.2 Create `lambda/shared/logger.ts`: instantiate `Logger` from `aws-lambda-powertools/logger` with `serviceName: process.env.SERVICE_NAME ?? 'serverless-api'`; export the instance and a `isColdStart` flag set once at module initialisation
  - [ ] 3.3 Create `lambda/shared/response.ts`: export `ok(body)` → 200, `created(body)` → 201, `noContent()` → 204, `notFound(id)` → 404, `badRequest(errors)` → 400, `conflict(msg)` → 409, `internalError()` → 500; all responses include `Content-Type: application/json` and `X-Request-Id` header
  - [ ] 3.4 Create `lambda/handlers/createItem.ts`: parse and validate body with `zod` schema (`id: z.string().uuid()`, `name: z.string().min(1).max(256)`, `data: z.record(z.unknown())`); call `PutCommand` with `ConditionExpression: 'attribute_not_exists(PK)'`; return 201 on success, 400 on validation failure, 409 on condition failure, 500 on unexpected error; emit structured log line with `"event": "create_item"`
  - [ ] 3.5 Create `lambda/handlers/getItem.ts`: extract `id` from `event.pathParameters`; call `GetCommand`; return 200 with item or 404; emit `"event": "get_item"` log line including `"itemId"` and `"isColdStart"` fields
  - [ ] 3.6 Create `lambda/handlers/updateItem.ts`: validate body with `zod`; call `UpdateCommand` with `ConditionExpression: 'attribute_exists(PK)'`; return 200 on success, 404 if item absent, 400 on validation failure
  - [ ] 3.7 Create `lambda/handlers/deleteItem.ts`: call `DeleteCommand`; return 204 on success; do not error if item was already absent (idempotent delete)
  - [ ] 3.8 Instantiate all four `NodejsFunction` handlers in `ServerlessApiStack` using the `createHandler` factory; pass `TABLE_NAME: table.tableName` and `SERVICE_NAME: 'serverless-api'` as environment variables; apply IAM grants: `table.grant(createItemFn, 'dynamodb:PutItem')`, `table.grantReadData(getItemFn)` narrowed to `GetItem` only via inline policy override, `table.grant(updateItemFn, 'dynamodb:UpdateItem')`, `table.grant(deleteItemFn, 'dynamodb:DeleteItem')`
  - [ ] 3.9 For prod environment, create `lambda.Version` from `getItemFn.currentVersion` and `lambda.Alias` with `provisionedConcurrentExecutions: 1`; tag alias with `Environment: prod` and `BilledConcurrency: provisioned`
  - [ ] 3.10 Add handler unit tests in `test/handlers/`: mock `@aws-sdk/lib-dynamodb` with `vitest`'s `vi.mock`; cover happy path, item-not-found (404), validation failure (400), and DynamoDB error (500) branches for `createItem` and `getItem` at minimum
  - [ ]* Validate: `npx vitest run` exits 0; `cdk synth -c environment=dev` exits 0; `cdk synth -c environment=prod` shows `AWS::Lambda::Alias` with `ProvisionedConcurrencyConfig`; CDK IAM policy assertion test passes confirming `dynamodb:GetItem` only on table ARN for `GetItemFunction`
  - _Requirements: R1.1, R1.2, R1.4, R1.5, R2.3, R2.4, R2.5, R3.1, R3.2, R3.3, R5.1, R5.2, R5.3, R6.1, R6.2_

- [ ] 4. API Gateway HTTP API and Observability
  - [ ] 4.1 Create `lib/constructs/crud-api.ts`: declare `apigatewayv2.HttpApi` with `corsPreflight: { allowOrigins: ['https://app.example.com'], allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS], allowHeaders: ['Content-Type', 'Authorization'] }`
  - [ ] 4.2 Add four `HttpRoute` entries in `CrudApiConstruct` using `HttpLambdaIntegration`: `POST /items` → `CreateItemFunction`, `GET /items/{id}` → `GetItemFunction` (use alias ARN in prod), `PUT /items/{id}` → `UpdateItemFunction`, `DELETE /items/{id}` → `DeleteItemFunction`
  - [ ] 4.3 Add `CfnOutput` with `exportName: 'ApiEndpoint'` and `value: api.apiEndpoint` to `ServerlessApiStack`
  - [ ] 4.4 Create CloudWatch Alarm constructs in `ServerlessApiStack`: `FunctionErrorRateAlarm` (math expression `errors / invocations > 0.01` per function), `DDBThrottleAlarm` (`SystemErrors > 0` for 5 min); connect both to a new `sns.Topic` named `OpsAlertsTopic`; export topic ARN as `CfnOutput`
  - [ ] 4.5 Add CDK assertions for the HTTP API: `resourceCountIs('AWS::ApiGatewayV2::Api', 1)`, `hasResourceProperties` for CORS allow origins and methods, and that all four routes exist with `POST /items`, `GET /items/{id}`, etc.
  - [ ] 4.6 Run `cdk deploy ServerlessApiStack -c environment=dev --require-approval never` against a dev AWS account; capture the `ApiEndpoint` output; run `curl -X POST <endpoint>/items -d '{"id":"<uuid>","name":"test","data":{}}' -H 'Content-Type: application/json'` and confirm HTTP 201
  - [ ]* Validate: `curl <ApiEndpoint>/items/<uuid>` returns 200 with the created item; `curl -X DELETE <ApiEndpoint>/items/<uuid>` returns 204; `curl <ApiEndpoint>/items/<uuid>` after delete returns 404; CloudWatch Logs show structured JSON lines for each invocation
  - _Requirements: R1.3, R2.3, R4.1, R4.2, R4.3, R4.4, R4.5, R6.3, R6.4, R6.5, R7.1, R7.2_

- [ ] 5. End-to-End Verification and Documentation
  - [ ] 5.1 Run `cdk synth -c environment=prod` and confirm: `AWS::Lambda::Alias` present with `ProvisionedConcurrencyConfig.ProvisionedConcurrentExecutions: 1`; `NoDynamoWildcard` aspect raises no errors; `AWS::DynamoDB::Table` has `DeletionPolicy: Retain`
  - [ ] 5.2 Run `cdk diff -c environment=staging` after making a no-op change and confirm exit code 0 with message "There were no differences"
  - [ ] 5.3 Attempt to synthesise a stack with a manually added `dynamodb:*` grant and confirm the `NoDynamoWildcard` aspect throws with the expected error message
  - [ ] 5.4 Run the Artillery load test (`artillery run load-test.yml --target <stagingApiEndpoint>`) at 200 RPS for 60 seconds and confirm p99 latency < 200 ms and zero 5xx responses
  - [ ] 5.5 Verify X-Ray service map in the AWS Console shows `API Gateway → GetItemFunction → DynamoDB` with no orphaned nodes and p50 latency below 50 ms for warm invocations
  - [ ] 5.6 Deploy to prod (`cdk deploy -c environment=prod`); confirm `GetItemFunction` provisioned concurrency alias is active; invoke `GET /items/<id>` 10 times in rapid succession and confirm no `Init Duration` log lines appear (all warm)
  - [ ]* Validate: all unit tests pass (`npx vitest run`); integration smoke (`curl` CRUD sequence) passes against dev; load test passes against staging; X-Ray map complete in prod
  - _Requirements: R1.3, R1.4, R5.1, R5.4, R5.5, R6.5, R7.2, R7.3, R7.4, R7.5_

- [ ] 6. Update Documentation
  - [ ] 6.1 Update `README.md` with: prerequisites (Node 20, AWS CLI, CDK v2), bootstrap instructions (`cdk bootstrap aws://<account>/<region>`), deploy commands for each environment, and a table mapping API routes to Lambda functions
  - [ ] 6.2 Add a `docs/architecture.md` referencing the Mermaid diagram from `design.md`; document the single-table data model (PK/SK patterns for items), IAM grant matrix, and CloudWatch alarm thresholds
  - [ ] 6.3 Add a `docs/runbooks/lambda-error-investigation.md` covering: how to find the relevant CloudWatch Log Group, query Logs Insights for errors by `awsRequestId`, navigate to the X-Ray trace from the `correlationId`, and escalate to the `ops-alerts` SNS topic

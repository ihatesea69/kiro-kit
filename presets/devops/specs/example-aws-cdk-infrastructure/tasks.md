# Implementation Plan: AWS CDK Infrastructure

## Overview

This plan delivers the multi-environment CDK infrastructure in five incremental phases. Each phase ends with a verifiable checkpoint — a passing `cdk synth`, a full test suite, or a deployed environment. Tasks within a phase without file-level dependencies can run in parallel.

Traceability tags use the format `R<N>.<AC>` where `N` is the Requirement number and `AC` is the Acceptance Criterion from `requirements.md`.

## Tasks

- [ ] 1. Project Bootstrap and TypeScript Foundation
  - [ ] 1.1 Initialise the CDK project: `cdk init app --language=typescript`; enable `"strict": true`, `"noImplicitAny": true`, `"target": "ES2020"` in `tsconfig.json`; confirm `tsc --noEmit` exits 0
  - [ ] 1.2 Add production dependencies: `aws-cdk-lib`, `constructs`, `cdk-nag`; add dev dependencies: `vitest`, `@vitest/snapshot`
  - [ ] 1.3 Create `lib/config.ts` with the `Environment` union type, `EnvironmentConfig` interface, and `CONFIG` record populated for `dev`, `staging`, and `prod` with distinct account IDs, regions, VPC CIDRs, NAT gateway counts, retention days, and removal policies
  - [ ] 1.4 Create `lib/base-stack.ts` as `abstract class BaseStack extends cdk.Stack`; in the constructor call `Tags.of(this).add('Environment', props.environment)`, `Tags.of(this).add('ManagedBy', 'cdk')`, `Tags.of(this).add('Repository', props.repositoryUrl)`, `Tags.of(this).add('Version', props.version ?? 'local')`
  - [ ] 1.5 Create `bin/app.ts`: read `environment` from `app.node.tryGetContext('environment')`; throw `Error('Pass -c environment=dev|staging|prod')` if undefined; import `CONFIG` and instantiate `DevStack`, `StagingStack`, `ProdStack` each with their `EnvironmentConfig`
  - [ ] 1.6 Run `cdk synth -c environment=dev` and confirm it exits 0 with an empty but valid CloudFormation template
  - _Requirements: R1.2, R2.1, R2.2, R7.5_

- [ ] 2. Core Constructs: Networking, Security, and Storage
  - [ ] 2.1 Create `lib/constructs/networking-construct.ts` implementing `NetworkingConstruct`: `ec2.Vpc` with public, private (PRIVATE_WITH_EGRESS), and isolated (PRIVATE_ISOLATED) subnet tiers; `natGateways` and `maxAzs` from props; `enableDnsHostnames: true`
  - [ ] 2.2 Create `lib/constructs/security-construct.ts` implementing `SecurityConstruct`: `kms.Key` with `enableKeyRotation: true`, `pendingWindow: Duration.days(30)`, removal policy from props; expose `grantDecrypt(grantee)` helper that grants `kms:Decrypt` and `kms:GenerateDataKey` — not `kms:*`
  - [ ] 2.3 Create `lib/constructs/storage-construct.ts` implementing `StorageConstruct`: `s3.Bucket` with `encryption: BucketEncryption.S3_MANAGED`, `enforceSSL: true`, `blockPublicAccess: BlockPublicAccess.BLOCK_ALL`, `versioned: true`, prod lifecycle rule (`noncurrentVersionExpiration: 90 days`); `dynamodb.Table` with `PK`+`SK`, `PAY_PER_REQUEST`, `pointInTimeRecovery: true`, `TableEncryption.AWS_MANAGED`; both removal policies from props
  - [ ] 2.4 Create `lib/constructs/compute-construct.ts` implementing `ComputeConstruct` as a placeholder `ecs.Cluster` construct (no tasks yet); accept `vpc: ec2.IVpc` as a prop; this construct will be extended when a compute workload is added
  - [ ] 2.5 Create `lib/aspects/no-wildcard-iam.ts` implementing `NoWildcardIam` as a CDK `IAspect`; visit all `iam.CfnPolicy` nodes; throw if any statement has `Action: "*"` or any DynamoDB/S3/KMS action paired with `Resource: "*"`
  - [ ] 2.6 Wire all four constructs into `lib/stacks/dev-stack.ts`, `lib/stacks/staging-stack.ts`, and `lib/stacks/prod-stack.ts`; each stack extends `BaseStack` and passes the appropriate `EnvironmentConfig`; apply `Aspects.of(this).add(new NoWildcardIam())` in `BaseStack`
  - [ ]* Validate: `cdk synth -c environment=dev` exits 0; `cdk synth -c environment=prod` shows `DeletionPolicy: Retain` on both the S3 bucket and DynamoDB table; `tsc --noEmit` exits 0
  - _Requirements: R1.1, R1.3, R1.4, R2.1, R2.2, R2.3, R3.2, R4.1, R4.2, R4.3_

- [ ] 3. cdk-nag Integration and Aspect Validation
  - [ ] 3.1 Add `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))` in `bin/app.ts` so every `cdk synth` runs `cdk-nag` checks; confirm `cdk synth -c environment=dev` exits 0 or shows only suppressible findings
  - [ ] 3.2 Add justified `NagSuppressions` for any `cdk-nag` findings that are intentionally accepted in `dev` (e.g. server access logging disabled); every suppression must include a `reason` string; any finding in `staging` or `prod` without a suppression must be fixed in the construct
  - [ ] 3.3 Update `NetworkingConstruct` to add a `ec2.SecurityGroup` with no ingress rules; expose it as `this.appSecurityGroup`; add an ingress rule for HTTPS (port 443) from `ec2.Peer.anyIpv4()` only; confirm `cdk-nag` AwsSolutions-EC23 (unrestricted ingress) does not fire
  - [ ] 3.4 Add `cdk diff` to the CI workflow (`.github/workflows/infra.yml`): run `cdk diff <StackName> -c environment=<env>` and capture the output; post it as a GitHub Actions job summary using `>> $GITHUB_STEP_SUMMARY`; exit 1 if changes are detected (gates manual approval)
  - [ ] 3.5 Write `lib/aspects/drift-alarm.ts` as a CDK Aspect that, for each `cfn.CfnStack` node in the prod tree, creates a `cloudwatch.Alarm` on the `CloudFormation/DriftedResources` metric and connects it to an SNS topic; apply this aspect to `ProdStack` only
  - [ ]* Validate: introduce a deliberate `cdk-nag` violation (e.g. S3 bucket without `enforceSSL`), run `cdk synth`, confirm it exits 1 with the AwsSolutions-S2 error; revert and confirm `cdk synth` passes again
  - _Requirements: R4.4, R4.5, R5.1, R5.2, R5.3, R2.5_

- [ ] 4. CDK Assertion and Snapshot Tests
  - [ ] 4.1 Create `test/constructs/networking.test.ts`: instantiate `NetworkingConstruct` in an isolated `cdk.Stack`; assert VPC CIDR, subnet count (public × AZ + private × AZ + isolated × AZ), and NAT gateway count using `Template.fromStack().hasResourceProperties('AWS::EC2::NatGateway', ...)`
  - [ ] 4.2 Create `test/constructs/storage.test.ts`: assert S3 bucket has `BlockPublicAcls: true`, `VersioningConfiguration.Status: Enabled`, `BucketEncryption.S3_MANAGED`; assert DynamoDB table has `BillingMode: PAY_PER_REQUEST`, `PointInTimeRecoveryEnabled: true`; assert no S3 or DynamoDB IAM action is paired with `Resource: "*"`
  - [ ] 4.3 Create `test/constructs/security.test.ts`: assert `KMSKey` `EnableKeyRotation: true`, `PendingWindowInDays: 30`; assert `grantDecrypt` produces a policy with only `kms:Decrypt` and `kms:GenerateDataKey` (not `kms:*`)
  - [ ] 4.4 Create `test/stacks/dev-stack.test.ts` and `test/stacks/prod-stack.test.ts`: assert `resourceCountIs` for VPC, NAT gateway, S3 bucket, DynamoDB table; assert prod stack has `DeletionPolicy: Retain` on stateful resources; assert all five required `CfnOutput` logical IDs are present
  - [ ] 4.5 Add snapshot tests in each stack test file: call `expect(Template.fromStack(stack).toJSON()).toMatchSnapshot()` and commit the initial `.snap` files; document in `CONTRIBUTING.md` that `vitest --update-snapshots` must be run intentionally when templates change
  - [ ] 4.6 Add a test that verifies `NoWildcardIam` aspect throws when a policy with `Action: "*"` is added to the test stack — confirm the test catches the violation before deployment
  - [ ] 4.7 Configure `vitest` to collect coverage for `lib/constructs/` with a threshold of 80 % statement coverage; add `"test": "vitest run --coverage"` to `package.json`
  - [ ]* Validate: `npm test` exits 0 with all assertion tests passing; snapshot files are committed; the `NoWildcardIam` violation test catches the deliberate violation and passes
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5_

- [ ] 5. End-to-End Verification and Documentation
  - [ ] 5.1 Run `cdk bootstrap aws://<dev-account>/us-east-1` against the dev AWS account; confirm the `CDKToolkit` stack is created with the S3 asset bucket and ECR repository
  - [ ] 5.2 Run `cdk deploy DevStack -c environment=dev --require-approval never`; confirm CloudFormation stack reaches `CREATE_COMPLETE`; verify VPC, subnets, S3 bucket, and DynamoDB table exist in the AWS Console with correct tags (`ManagedBy: cdk`, `Environment: dev`)
  - [ ] 5.3 Make a no-op change (add a comment to `lib/config.ts`), run `cdk diff DevStack -c environment=dev`, confirm output is "There were no differences" and exit code is 0
  - [ ] 5.4 Update the VPC CIDR in `dev` config to a new value, run `cdk diff DevStack -c environment=dev`, confirm the diff shows a VPC replacement (`-/+`), then revert the change
  - [ ] 5.5 Enable CloudFormation drift detection on `DevStack` via `aws cloudformation detect-stack-drift --stack-name myapp-dev`; manually add an S3 bucket tag in the Console; confirm drift is detected and `CFDriftAlarm` fires (if wired to staging/prod)
  - [ ] 5.6 Run `cdk synth -c environment=prod` and confirm: `DeletionPolicy: Retain` on S3 and DynamoDB; `NatGateway` count is 3; `KMSKey` has `EnableKeyRotation: true`; `NoWildcardIam` and `cdk-nag` both pass
  - [ ]* Validate: all unit and snapshot tests pass; `DevStack` deployed successfully; `cdk diff` reports no changes on a clean deploy; prod synth passes all security checks
  - _Requirements: R2.3, R3.1, R3.2, R3.3, R3.4, R5.1, R5.2, R5.4, R5.5, R7.1, R7.2, R7.3, R7.5_

- [ ] 6. Update Documentation
  - [ ] 6.1 Update `README.md` with: prerequisites (`aws cdk >= 2.x`, Node 20, AWS CLI with SSO), bootstrap command per environment, `cdk synth / diff / deploy` commands for each environment, and a table of construct props with defaults
  - [ ] 6.2 Add `docs/construct-catalog.md` listing all four constructs with their `Props` interfaces, default values, and examples of overriding defaults for cost optimisation in dev
  - [ ] 6.3 Add `docs/runbooks/cdk-deploy-failure.md` covering: how to read CloudFormation Events to find the root cause of a failed update, how to manually resolve `UPDATE_ROLLBACK_FAILED` state, and how to identify drift and reconcile it with `cdk deploy`

# Requirements Document

## Introduction

This document specifies the requirements for an **AWS CDK Infrastructure-as-Code** system that provisions and manages cloud resources across three environments — `dev`, `staging`, and `prod` — using TypeScript CDK constructs. The system treats infrastructure as software: every resource is version-controlled, peer-reviewed, and deployed through a reproducible pipeline. It enforces immutable infrastructure patterns, encryption at rest and in transit, least-privilege IAM, and testability through CDK assertions and snapshot tests.

The CDK project is organised into modular, reusable constructs (L3 patterns), with environment-specific configuration injected via CDK context keys rather than hardcoded values. A `cdk synth` → `cdk diff` → `cdk deploy` workflow gates every change, with the synthesised CloudFormation template validated by CDK assertions before any deployment runs.

## Glossary

| Term | Definition |
|------|------------|
| CDK App | The root `cdk.App` instance in `bin/app.ts`; instantiates all stacks |
| CDK Stack | A unit of CloudFormation deployment; each environment has its own stack instance |
| L2 Construct | CDK opinionated wrapper around a single CloudFormation resource (e.g. `s3.Bucket`, `ec2.Vpc`) |
| L3 Construct / Pattern | CDK higher-level pattern composing multiple L2 constructs into a reusable unit (e.g. `patterns.ApplicationLoadBalancedFargateService`) |
| CDK Context | Key-value configuration passed via `-c key=value` or `cdk.json`; used to drive environment-specific values |
| CDK Synth | `cdk synth` — synthesises TypeScript constructs into a CloudFormation template; performs Aspect validations |
| CDK Diff | `cdk diff` — compares the synthesised template against the deployed CloudFormation stack; outputs planned changes |
| CDK Bootstrap | One-time per-account/region setup that creates the `CDKToolkit` stack, S3 asset bucket, and ECR repository |
| Immutable infrastructure | Resources are replaced rather than mutated in-place; new resources are created before old ones are deleted |
| CDK Aspects | Visitor pattern applied to the entire construct tree during synth; used for cross-cutting policy enforcement |
| Snapshot test | A vitest test that serialises `Template.toJSON()` and compares it against a stored `.snap` file; detects unintended drift |
| `cdk-nag` | An open-source CDK Aspects library (by Aspect CTO) that applies AWS Well-Architected and NIST security rules to the synthesised template |

## Out of Scope

- Application code deployment (Lambda functions, container images) — covered by the AWS Serverless API and CI/CD Pipeline specs
- Multi-region active-active deployments
- AWS Control Tower or Organizations-level governance
- Manual CloudFormation operations outside the CDK workflow
- CDK Pipelines (`pipelines.CodePipeline`) — the deployment pipeline is GitHub Actions, covered in the CI/CD Pipeline spec
- Windows-based EC2 instances or non-ARM workloads

## Requirements

### Requirement 1: Modular Construct Library

**User Story:** As a platform engineer, I want shared infrastructure patterns encapsulated in reusable L3 constructs, so that new environments or services can be provisioned by composing constructs rather than duplicating CloudFormation resource definitions.

#### Acceptance Criteria

1. WHEN the CDK project is synthesised, THE SYSTEM SHALL contain at least four custom L3 constructs in `lib/constructs/`: `NetworkingConstruct` (VPC + subnets + NAT), `SecurityConstruct` (KMS keys + security groups), `ComputeConstruct` (ECS cluster or Lambda layer), and `StorageConstruct` (S3 bucket + DynamoDB table with shared defaults).
2. WHERE constructs are defined, THE SYSTEM SHALL accept only typed `Props` interfaces; no construct SHALL accept a generic `any` typed property; TypeScript strict mode (`"strict": true` in `tsconfig.json`) SHALL be enabled.
3. WHEN a new construct instance is created with the same `Props` across environments, THE SYSTEM SHALL produce CloudFormation templates that differ only in environment-specific values (CIDR blocks, instance sizes, retention periods) and not in resource structure.
4. IF a required `Props` field is omitted when instantiating a construct, THE SYSTEM SHALL produce a TypeScript compile error at build time rather than a runtime CloudFormation failure.
5. WHERE constructs expose output values for cross-stack references, THE SYSTEM SHALL export them as typed properties (e.g. `this.vpc: ec2.IVpc`, `this.table: dynamodb.ITable`) rather than as raw `CfnOutput` strings, enabling type-safe cross-stack wiring.

### Requirement 2: Multi-Environment Stack Isolation

**User Story:** As a platform engineer, I want separate CDK stacks for dev, staging, and prod environments that share construct definitions but differ in configuration, so that a change tested in dev can be promoted to prod with confidence that the same construct logic applies.

#### Acceptance Criteria

1. WHEN the CDK App is instantiated in `bin/app.ts`, THE SYSTEM SHALL create three stack instances — `DevStack`, `StagingStack`, and `ProdStack` — each targeting a distinct AWS account and region pair read from CDK context; no stack SHALL hard-code account IDs or region strings.
2. WHERE environment-specific values differ (VPC CIDR, NAT gateway count, DynamoDB table class, S3 lifecycle rules, retention days), THE SYSTEM SHALL source them from a typed `EnvironmentConfig` record in `lib/config.ts` keyed by environment name (`dev` | `staging` | `prod`).
3. WHEN `cdk deploy DevStack` runs, THE SYSTEM SHALL NOT modify any CloudFormation resource in `StagingStack` or `ProdStack`; stack names SHALL include the environment suffix (e.g. `myapp-dev`, `myapp-staging`, `myapp-prod`) to prevent naming collisions.
4. IF `cdk deploy ProdStack` is invoked without the flag `--require-approval broadening`, THE SYSTEM SHALL prompt for approval on any IAM or security-group change that broadens access, enforced by setting `requireApproval: RequireApproval.BROADENING` in the CDK pipeline configuration.
5. WHEN a CloudFormation drift detection scan is run on any deployed stack, THE SYSTEM SHALL report zero drifted resources because all changes flow exclusively through `cdk deploy`; any detected drift SHALL trigger a CloudWatch Alarm and Slack notification.

### Requirement 3: Immutable Infrastructure Patterns

**User Story:** As an SRE, I want resources to be replaced rather than mutated in-place during updates, so that deployments are predictable, rollbackable, and free from configuration drift.

#### Acceptance Criteria

1. WHEN the CDK stack is synthesised, THE SYSTEM SHALL NOT use `physicalName` overrides on any resource that CloudFormation can replace (S3 buckets, Lambda functions, security groups); logical IDs shall be CDK-generated to allow safe replacement.
2. WHERE stateful resources (DynamoDB tables, S3 buckets, RDS instances) are declared, THE SYSTEM SHALL set `removalPolicy: cdk.RemovalPolicy.RETAIN` in the `prod` environment and `cdk.RemovalPolicy.DESTROY` in `dev` to prevent accidental data loss.
3. WHEN a `cdk diff` against `ProdStack` shows a resource replacement (`-/+` diff type), THE SYSTEM SHALL require manual confirmation in the CI pipeline via a GitHub Actions environment protection rule before `cdk deploy` proceeds.
4. IF a CloudFormation stack update rolls back due to an error, THE SYSTEM SHALL leave the stack in `UPDATE_ROLLBACK_COMPLETE` state with the previous resources intact; no manual resource cleanup SHALL be required.
5. WHERE ECS task definitions or Lambda function versions are updated, THE SYSTEM SHALL create new revisions and update the alias or service to point to the new revision atomically via CloudFormation; old revisions SHALL be retained for 3 deployments as rollback targets.

### Requirement 4: Encryption and Least-Privilege by Default

**User Story:** As a security engineer, I want all constructs to enforce encryption at rest and in transit and apply least-privilege IAM by default, so that security hardening is a property of the construct library rather than an opt-in per resource.

#### Acceptance Criteria

1. WHEN `StorageConstruct` creates an S3 bucket, THE SYSTEM SHALL set `encryption: s3.BucketEncryption.S3_MANAGED`, `enforceSSL: true`, `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL`, and `versioned: true`; any deviation from these defaults SHALL require an explicit override documented in a code comment.
2. WHERE KMS keys are created by `SecurityConstruct`, THE SYSTEM SHALL set `enableKeyRotation: true`, `pendingWindow: cdk.Duration.days(30)`, and grant specific key actions (`kms:Decrypt`, `kms:GenerateDataKey`) only to the IAM principals that need them; `kms:*` grants SHALL be prohibited.
3. WHEN any IAM role is created by a construct, THE SYSTEM SHALL apply the principle of least privilege: `assumedBy` must be a specific service principal (e.g. `new iam.ServicePrincipal('lambda.amazonaws.com')`), not `new iam.AnyPrincipal()`; no role SHALL have `AdministratorAccess` or `PowerUserAccess` managed policies.
4. IF `cdk-nag` (`AwsSolutionsChecks`) reports a WARN or ERROR on any construct in the synthesised template, THE SYSTEM SHALL fail `cdk synth` with a non-zero exit code; suppressions SHALL only be added with a `reason` string explaining the accepted risk.
5. WHERE VPC security groups are created, THE SYSTEM SHALL NOT allow ingress from `0.0.0.0/0` (open internet) on any port other than 443; any security group allowing broader ingress SHALL fail the `cdk-nag` check.

### Requirement 5: CDK Synth, Diff, and Deploy Workflow

**User Story:** As a platform engineer, I want a disciplined `synth → diff → deploy` workflow with explicit approval gates, so that no infrastructure change reaches prod without having been reviewed as a concrete CloudFormation diff.

#### Acceptance Criteria

1. WHEN `cdk synth` is run, THE SYSTEM SHALL produce a CloudFormation template in `cdk.out/` and exit 0 if all Aspect validations and `cdk-nag` checks pass; it SHALL exit 1 with descriptive error output if any check fails.
2. WHEN `cdk diff <StackName>` is run, THE SYSTEM SHALL print a human-readable diff of added, modified, and removed CloudFormation resources and exit 0 if no changes exist or 1 if changes are present; the diff output SHALL be captured and posted as a GitHub Actions job summary.
3. WHEN `cdk deploy <StackName>` is run in CI for the `dev` environment, THE SYSTEM SHALL proceed automatically with `--require-approval never`; for `staging`, THE SYSTEM SHALL require a manual approval step in GitHub Actions; for `prod`, THE SYSTEM SHALL require both a manual approval AND the `cdk diff` output to have been reviewed in the PR.
4. IF `cdk deploy` fails mid-update, THE SYSTEM SHALL NOT leave any resource in an indeterminate state; CloudFormation SHALL automatically roll back all changes in the failing stack update.
5. WHERE CDK assets (Lambda bundles, Docker images) are uploaded to the CDK bootstrap S3 bucket and ECR repository, THE SYSTEM SHALL use content-addressed keys (asset hash) so that identical assets are uploaded once and reused across environments.

### Requirement 6: Stack Testing with CDK Assertions and Snapshots

**User Story:** As a platform engineer, I want automated tests that verify the synthesised CloudFormation template contains the expected resources and configurations, so that infrastructure regressions are caught before deployment rather than after.

#### Acceptance Criteria

1. WHEN `npm test` is run, THE SYSTEM SHALL execute CDK assertion tests using `aws-cdk-lib/assertions` `Template.fromStack()` that verify: (a) resource counts for key resource types, (b) IAM policy statements contain no wildcards on sensitive actions, (c) S3 bucket encryption and public access settings, (d) DynamoDB table billing mode and PITR, and (e) all CloudFormation outputs are present with expected logical IDs.
2. WHEN snapshot tests are run with `vitest`, THE SYSTEM SHALL serialise `Template.toJSON()` for each stack into a `.snap` file and fail if the template changes without an explicit snapshot update (`vitest --update-snapshots`), ensuring infrastructure changes are always deliberate.
3. IF a CDK assertion test fails because a required resource property is missing or incorrect, THE SYSTEM SHALL produce a test failure message that includes the expected property path, the actual value, and the name of the CDK construct responsible.
4. WHERE `cdk-nag` suppressions exist, THE SYSTEM SHALL have a corresponding assertion test that verifies the suppressed resource is present and the suppression reason is documented, preventing suppressions from masking genuine issues.
5. WHEN a new L3 construct is added to `lib/constructs/`, THE SYSTEM SHALL require a corresponding test file in `test/constructs/` that covers the construct in isolation using `new cdk.Stack()` as the test scope; the PR SHALL not be mergeable without the test file.

### Requirement 7: Version Control and Change Governance

**User Story:** As a platform engineer, I want all infrastructure changes to follow the same pull-request and code-review process as application code, so that infrastructure history is auditable and changes are reversible.

#### Acceptance Criteria

1. WHEN infrastructure code is changed, THE SYSTEM SHALL require a pull request with at least one reviewer approval and passing CI checks (TypeScript compile, `cdk synth`, unit tests, `cdk diff` output attached as PR comment) before merge to the `main` branch.
2. WHERE `cdk.json` context values are modified, THE SYSTEM SHALL treat the change as a configuration change subject to the same PR review as any other code change; context values SHALL NOT be modified directly in the AWS Console or CLI.
3. WHEN a `git tag` matching `v*.*.*` is pushed to the repository, THE SYSTEM SHALL trigger the prod deployment pipeline; deployments to prod SHALL only occur from tagged releases, not from arbitrary commits on `main`.
4. IF a hotfix is needed in prod, THE SYSTEM SHALL allow cherry-picking commits to a `hotfix/*` branch, applying a patch tag, and deploying through the same pipeline; the hotfix SHALL be back-merged to `main` within 24 hours.
5. WHERE AWS resource tags are applied, THE SYSTEM SHALL use the `Tags.of(this).add(key, value)` API in the stack constructor to tag all resources with `Environment: <env>`, `ManagedBy: cdk`, `Repository: <repo-url>`, and `Version: <git-tag>` so resources can be attributed in Cost Explorer and audited.

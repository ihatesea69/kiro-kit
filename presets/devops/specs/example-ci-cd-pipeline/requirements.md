# Requirements Document

## Introduction

This document specifies the requirements for a **GitHub Actions CI/CD pipeline** that builds, tests, secures, and deploys an AWS CDK application across `dev`, `staging`, and `prod` environments. Every deployment assumes an AWS IAM role via **OIDC (OpenID Connect) Workload Identity** — no long-lived AWS access keys are stored in GitHub Secrets. The pipeline gates each stage with automated quality checks and uses GitHub Environments for manual approval on staging and prod. Rollback is automated on smoke-test failure and available as a manual one-click action.

The pipeline stages are: **Build → Test → Security Scan → CDK Diff → Deploy → Smoke Test → (Rollback on failure)**. A deployment to prod requires a tagged release, environment protection rules, and reviewer sign-off.

## Glossary

| Term | Definition |
|------|------------|
| OIDC | OpenID Connect; GitHub Actions generates a short-lived JWT that AWS STS exchanges for temporary credentials via `AssumeRoleWithWebIdentity`; no static AWS keys are stored |
| OIDC Provider | An AWS IAM Identity Provider resource that trusts `https://token.actions.githubusercontent.com` |
| Assume Role | The AWS STS operation that exchanges an OIDC token for temporary IAM credentials valid for up to 1 hour |
| GitHub Environment | A GitHub-managed deployment target (`dev`, `staging`, `prod`) with optional protection rules (required reviewers, wait timer) |
| Environment Protection Rule | A GitHub setting on an Environment that blocks a deployment job until a named reviewer approves it |
| CDK Diff | `cdk diff` compares the current synthesised template against the live CloudFormation stack; exit code 1 if changes exist |
| Smoke Test | A lightweight HTTP assertion script that runs against the deployed endpoint after each deployment to verify basic availability |
| Rollback | Re-deploying the previous Git tag's CDK stack to undo a failed deployment; triggered automatically on smoke-test failure |
| SARIF | Static Analysis Results Interchange Format; used by GitHub Code Scanning to display security findings in the Security tab |
| OIDC Subject | The `sub` claim in the GitHub Actions OIDC token; constrained to `repo:<org>/<repo>:environment:<env>` or `ref:refs/tags/*` to limit which workflows can assume the prod role |

## Out of Scope

- Manual deployments outside this pipeline (direct `cdk deploy` from a developer workstation in prod)
- Multi-cloud deployments (Azure, GCP)
- Blue-green or canary deployment strategies — covered in the Blue-Green Deployment spec
- Monorepo multi-service orchestration (this pipeline deploys one CDK application)
- Container image building — the CDK application uses Lambda, not ECS/ECR
- Performance / load testing — treated as a separate nightly workflow

## Requirements

### Requirement 1: OIDC Authentication to AWS — No Long-Lived Keys

**User Story:** As a security engineer, I want GitHub Actions to authenticate to AWS using short-lived OIDC tokens, so that no static AWS access keys are stored in GitHub Secrets and a compromised workflow cannot be leveraged to obtain persistent AWS access.

#### Acceptance Criteria

1. WHEN any workflow job requires AWS access, THE SYSTEM SHALL use `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ vars.AWS_ROLE_ARN }}` and `role-session-name: github-actions-${{ github.run_id }}`; no `aws-access-key-id` or `aws-secret-access-key` inputs SHALL be present in any workflow file.
2. WHERE the GitHub Actions OIDC provider is configured in AWS IAM, THE SYSTEM SHALL create an `AWS::IAM::OIDCProvider` with `Url: https://token.actions.githubusercontent.com` and `ClientIdList: [sts.amazonaws.com]`; this resource SHALL be managed by the CDK bootstrap stack extension.
3. WHEN the IAM role trust policy is defined, THE SYSTEM SHALL constrain the `sub` condition: for `dev` and `staging` deployments to `repo:<org>/<repo>:ref:refs/heads/main`; for `prod` deployments to `repo:<org>/<repo>:ref:refs/tags/v*`; no wildcard subject claims SHALL be permitted.
4. IF a workflow run from a fork or an unexpected branch attempts to assume the deployment role, THE SYSTEM SHALL receive an `AccessDenied` error from STS and the `configure-aws-credentials` step SHALL fail with exit code 1, blocking all downstream steps.
5. WHEN temporary credentials are obtained, THE SYSTEM SHALL set `role-duration-seconds: 3600` (maximum for OIDC-based assume-role); credentials SHALL expire automatically after 1 hour and SHALL NOT be cached between workflow runs.

### Requirement 2: Build and Unit Test Stage

**User Story:** As a developer, I want every push to a pull request to automatically build the CDK application and run all unit tests, so that regressions are caught before code is reviewed or merged.

#### Acceptance Criteria

1. WHEN a pull request is opened or updated against the `main` branch, THE SYSTEM SHALL trigger the `ci` workflow and run the `build` job within 2 minutes of the push event.
2. WHEN the `build` job runs, THE SYSTEM SHALL execute `npm ci` (not `npm install`), `tsc --noEmit`, and `cdk synth -c environment=dev` in sequence; if any command exits non-zero, THE SYSTEM SHALL mark the `build` job failed and block the PR from merging.
3. WHEN the `test` job runs (parallel to `build`), THE SYSTEM SHALL execute `npm test` (vitest) and produce a JUnit XML report uploaded as a workflow artifact named `test-results.xml`; if any test fails, THE SYSTEM SHALL mark the `test` job failed.
4. WHERE Node.js is installed in CI, THE SYSTEM SHALL pin the version to `20.x` using `actions/setup-node@v4` with `node-version: '20'` and `cache: 'npm'`; the `node_modules` directory SHALL be restored from the GitHub Actions cache when `package-lock.json` is unchanged.
5. IF `tsc --noEmit` reports any type error, THE SYSTEM SHALL upload the TypeScript error output as a workflow artifact named `tsc-errors.txt` so engineers can view the full error list without re-running the job.

### Requirement 3: Security Scanning Stage

**User Story:** As a security engineer, I want automated security scans on every PR and deployment, so that secrets, dependency vulnerabilities, and IaC misconfigurations are caught before code reaches production.

#### Acceptance Criteria

1. WHEN a pull request is created or updated, THE SYSTEM SHALL run `npm audit --audit-level=high` and fail the `security-scan` job if any HIGH or CRITICAL vulnerability is found in production dependencies (`--omit=dev`).
2. WHEN a pull request is created or updated, THE SYSTEM SHALL run `cdk synth -c environment=dev` (which includes `cdk-nag AwsSolutionsChecks`) and fail the `security-scan` job if `cdk-nag` reports any ERROR-level finding not suppressed with a documented reason.
3. WHERE SAST scanning is required, THE SYSTEM SHALL run `semgrep --config=p/typescript --config=p/secrets --error` on the `lambda/` and `lib/` directories and upload results as a SARIF file to the GitHub Security tab using `github/codeql-action/upload-sarif@v3`; findings of HIGH severity SHALL fail the `security-scan` job.
4. WHEN Semgrep detects a secret pattern (e.g. hardcoded API key, AWS access key), THE SYSTEM SHALL immediately fail the `security-scan` job with exit code 1 and post a PR comment listing the file and line number of each finding.
5. IF any `security-scan` job check fails, THE SYSTEM SHALL block the PR from merging via a required status check named `security-scan / all-checks`; the PR author SHALL not be able to bypass this check without repository admin privileges.

### Requirement 4: CDK Diff Gate

**User Story:** As a platform engineer, I want the exact CloudFormation diff posted as a comment on every pull request, so that reviewers can see the infrastructure impact of code changes without needing local CDK access.

#### Acceptance Criteria

1. WHEN a pull request is created or updated against `main`, THE SYSTEM SHALL run `cdk diff DevStack -c environment=dev` against the live `dev` CloudFormation stack and post the full diff output as a comment on the PR using the `marocchino/sticky-pull-request-comment` action with update-if-exists behaviour.
2. WHERE the CDK diff detects a resource replacement (`-/+` line in the output), THE SYSTEM SHALL add the label `infra:replacement` to the PR so reviewers are alerted that a stateful resource will be deleted and re-created.
3. WHEN `cdk diff` is run against the `prod` stack as part of the release workflow, THE SYSTEM SHALL capture the diff output and include it in the GitHub Release notes body so the deployed change set is permanently recorded.
4. IF `cdk diff` exits 0 (no changes), THE SYSTEM SHALL post a comment `No infrastructure changes detected for this PR` and skip the `infra:replacement` label.
5. WHEN the CDK diff shows IAM permission broadening (new `Allow` statement or resource wildcard expansion), THE SYSTEM SHALL require approval from the `security-reviewers` GitHub team before the PR can be merged; this is enforced via a CODEOWNERS entry for `lib/` and `bin/`.

### Requirement 5: Deployment Stages with Environment Approvals

**User Story:** As a platform engineer, I want deployments to dev to be fully automated, staging to require one reviewer approval, and prod to require two reviewer approvals and a tagged release, so that the promotion path enforces increasing scrutiny as changes get closer to users.

#### Acceptance Criteria

1. WHEN a commit is merged to the `main` branch, THE SYSTEM SHALL automatically trigger a deployment to the `dev` GitHub Environment (`cdk deploy DevStack --require-approval never`) without any manual approval step; the deployment SHALL complete within 10 minutes of merge.
2. WHEN the `dev` deployment succeeds and smoke tests pass, THE SYSTEM SHALL create a deployment job targeting the `staging` GitHub Environment; this job SHALL pause and wait for approval from at least one member of the `platform-engineers` team before proceeding.
3. WHEN a Git tag matching `v[0-9]+.[0-9]+.[0-9]+` is pushed to the repository, THE SYSTEM SHALL trigger the `release` workflow; this workflow SHALL deploy to `prod` only after receiving approval from at least two members of the `platform-leads` team via the `prod` GitHub Environment protection rule.
4. IF a deployment to any environment is still running when a newer commit triggers a new deployment to the same environment, THE SYSTEM SHALL cancel the in-progress deployment using the GitHub Actions `concurrency` group `deploy-<environment>` with `cancel-in-progress: true` for `dev` and `cancel-in-progress: false` for `staging` and `prod`.
5. WHERE deployment jobs run, THE SYSTEM SHALL set the GitHub Deployment status to `in_progress` at job start, `success` on completion, and `failure` on job failure using `actions/github-script` to call the GitHub Deployments API; these statuses SHALL be visible on the repository's Deployments page.

### Requirement 6: Post-Deployment Smoke Tests and Automated Rollback

**User Story:** As an SRE, I want smoke tests to run immediately after every deployment and trigger an automatic rollback if they fail, so that a broken deployment never stays live for more than 5 minutes.

#### Acceptance Criteria

1. WHEN a `cdk deploy` job succeeds, THE SYSTEM SHALL run the `smoke-test` job targeting the deployed environment's API endpoint (read from the `ApiEndpoint` CloudFormation output); the smoke test SHALL make HTTP requests to at minimum `GET /healthz` (expect 200) and `GET /api/v1/status` (expect 200 with non-empty JSON body) within a 30-second timeout.
2. IF any smoke test assertion fails or the HTTP request times out, THE SYSTEM SHALL immediately trigger the `rollback` job; the rollback job SHALL check out the previous release tag from git history, run `cdk deploy <Stack> --require-approval never`, and verify the smoke tests pass on the rolled-back version.
3. WHEN the `rollback` job completes successfully, THE SYSTEM SHALL post a Slack notification to `#deployments` with message `Rollback to <previous-tag> completed for <environment>. Failed release: <failed-tag>. Run: <workflow-url>` using the `SLACK_DEPLOY_WEBHOOK` secret.
4. IF the rollback deployment itself fails, THE SYSTEM SHALL create a GitHub Issue in the repository with title `[P0] Rollback failed in <environment> — run ${{ github.run_id }}`, label `p0-incident`, and assign it to the `platform-leads` team; a PagerDuty Events API v2 alert SHALL also be fired using the `PAGERDUTY_ROUTING_KEY` secret.
5. WHILE smoke tests are executing, THE SYSTEM SHALL emit one structured JSON log line per assertion to the GitHub Actions log in the format `{ "test": "<name>", "environment": "<env>", "status": "<pass|fail>", "http_status": <n>, "latency_ms": <n>, "endpoint": "<url>" }` so results are searchable in the workflow log.

### Requirement 7: Pipeline Observability and Audit Trail

**User Story:** As a platform engineer, I want every deployment to produce an auditable record of what changed, who approved it, and whether it succeeded or rolled back, so that post-incident reviews can reconstruct the exact sequence of events.

#### Acceptance Criteria

1. WHEN a deployment to any environment completes (success or failure), THE SYSTEM SHALL write a deployment record to the GitHub Deployments API containing the environment name, the Git SHA deployed, the deploying actor, the start time, and the completion status.
2. WHERE deployment jobs complete successfully, THE SYSTEM SHALL create a GitHub Release (for prod only) with the tag name, the CDK diff output captured during the PR, a changelog generated from `git log --oneline <prev-tag>..<new-tag>`, and the smoke test results attached as a release asset.
3. WHEN a prod deployment is approved by a reviewer, THE SYSTEM SHALL capture the approver's GitHub username from the `${{ github.event.review.user.login }}` context and include it in the GitHub Deployment description so the approval is permanently recorded against the deployment.
4. IF a workflow run is cancelled by any actor (manual cancel, concurrency eviction, or timeout), THE SYSTEM SHALL run a `cleanup` job with `if: always()` that sets the GitHub Deployment status to `inactive` and posts a Slack message indicating the cancellation.
5. WHERE pipeline metrics are collected, THE SYSTEM SHALL emit deployment duration (build + deploy combined) and smoke-test pass/fail counts to a CloudWatch custom namespace `CICD/Deployments` with dimensions `Environment` and `Repository` using `aws cloudwatch put-metric-data` at the end of each deploy job.

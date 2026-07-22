# Requirements Document

## Introduction

This document specifies the requirements for a Blue-Green Deployment pipeline that delivers zero-downtime releases of containerized applications on Kubernetes. The pipeline is orchestrated by GitHub Actions, infrastructure is managed with Terraform, and traffic switching is performed by updating the `slot` label selector on the `app-production` Kubernetes Service.

At any point in time exactly one slot (`blue` or `green`) serves 100 % of production traffic. The inactive slot holds the previous release and acts as an instant rollback target. A successful deployment progresses through: image build → green provisioning → health checks and smoke tests → traffic switch → verification. Any failure in the post-build stages automatically reverts the Service selector to the previously active slot before alerting on-call staff.

## Glossary

| Term | Definition |
|------|------------|
| Blue slot | The currently active Kubernetes Deployment (`app-blue`) serving production traffic |
| Green slot | The inactive Kubernetes Deployment (`app-green`) targeted for the next release |
| Active slot | Whichever slot the `app-production` Service selector currently points to (`slot: blue` or `slot: green`) |
| Traffic switch | An atomic `kubectl patch` that changes the `app-production` Service's `slot` label selector from blue to green (or vice versa for rollback) |
| Smoke test | A lightweight HTTP assertion suite (≤ 30 s) that validates critical endpoints on the green slot before the traffic switch |
| Rollback | Patching the `app-production` Service selector back to the previously active slot; takes effect within the `kube-proxy` sync period (< 5 s) |
| OIDC token | Short-lived federated JWT issued to a GitHub Actions workflow run; exchanged for GKE credentials without storing any static service-account key |
| Deploy lock | A Kubernetes ConfigMap (`deploy-lock` in the `production` namespace) that serialises concurrent pipeline executions |

## Requirements

### Requirement 1: Automated Image Build and Registry Push

**User Story:** As a platform engineer, I want every merge to the `main` branch to automatically build a versioned container image and push it to the container registry, so that deployments always use an immutable, traceable artifact.

#### Acceptance Criteria

1. WHEN a commit is pushed to the `main` branch, THE SYSTEM SHALL trigger the `build` GitHub Actions job within 60 seconds of the push event being received by GitHub.
2. WHEN the Docker build succeeds, THE SYSTEM SHALL push the image to `ghcr.io/<org>/<app>` tagged with both the full Git SHA (`sha-${{ github.sha }}`) and `latest`, and output the digest-pinned reference (e.g., `ghcr.io/<org>/<app>@sha256:<digest>`) as the `image-ref` job output consumed by downstream jobs.
3. WHEN the Docker build or Trivy CVE scan reports a HIGH or CRITICAL severity finding, THE SYSTEM SHALL mark the `build` job as failed, upload the scan report as a workflow artifact named `trivy-results.sarif`, and halt all downstream pipeline stages without modifying any Kubernetes resource.
4. WHILE the image is being pushed to `ghcr.io`, THE SYSTEM SHALL authenticate using the auto-generated `GITHUB_TOKEN` with `packages: write` scope via OIDC; no personal access tokens or static registry credentials SHALL be stored in repository secrets.
5. WHEN the push completes successfully, THE SYSTEM SHALL emit the digest-pinned image reference as the `image-ref` job output so that the `deploy-green` job references the exact image digest rather than a mutable tag.

### Requirement 2: Green Environment Provisioning

**User Story:** As an SRE, I want the pipeline to provision or update the green Kubernetes Deployment with the new container image without touching the active blue Deployment, so that the live environment remains unaffected during rollout preparation.

#### Acceptance Criteria

1. WHEN the `build` job succeeds, THE SYSTEM SHALL substitute `${IMAGE_REF}` in `k8s/production/green/deployment.yaml` with the digest-pinned reference from the `image-ref` job output and apply the manifest using `kubectl apply -f k8s/production/green/deployment.yaml -n production`.
2. WHILE the `app-green` Deployment rollout is in progress, THE SYSTEM SHALL poll `kubectl rollout status deployment/app-green -n production` every 10 seconds and fail the `deploy-green` job if the rollout does not reach `Available` status within 5 minutes.
3. IF the `app-green` Deployment rollout does not reach `Available` status within 5 minutes, THE SYSTEM SHALL mark the `deploy-green` job as failed, leave the `app-blue` Deployment and `app-production` Service selector untouched, and trigger the `rollback` job.
4. WHEN the Terraform apply for green infrastructure runs, THE SYSTEM SHALL operate in a dedicated Terraform workspace named `green` (selected via `terraform workspace select green`) to prevent state collisions with the `blue` workspace.
5. WHERE the green Deployment pods are running, THE SYSTEM SHALL enforce readiness probes configured with `httpGet.path: /readyz`, `httpGet.port: 8080`, `initialDelaySeconds: 10`, `periodSeconds: 5`, and `failureThreshold: 3` so pod readiness is gated independently of the pipeline smoke-test step.

### Requirement 3: Automated Health Checks and Smoke Tests

**User Story:** As a platform engineer, I want comprehensive health checks and smoke tests executed against the green Deployment before any traffic is switched, so that regressions are caught before they affect users.

#### Acceptance Criteria

1. WHEN the `deploy-green` job succeeds, THE SYSTEM SHALL run the `smoke-test` job by deploying a curl-based test pod (`k8s/smoke-tests/pod.yaml`) into the `production` namespace and directing all HTTP requests to the internal ClusterIP Service `app-green-svc` (selector `slot: green`) rather than to the public-facing `app-production` Service.
2. WHEN all smoke test HTTP assertions return 2xx status codes within 10 seconds each, THE SYSTEM SHALL annotate the `app-green` Deployment with `deploy.kiro-kit/smoke-pass: "true"` and allow the `switch-traffic` job to proceed.
3. IF any smoke test HTTP assertion returns a non-2xx status code, times out after 10 seconds, or the test runner script exits non-zero for any reason, THE SYSTEM SHALL mark the `smoke-test` job as failed, annotate `app-green` with `deploy.kiro-kit/smoke-pass: "false"`, and trigger the `rollback` job without modifying the `app-production` Service selector.
4. WHILE smoke tests are executing, THE SYSTEM SHALL emit one structured JSON log line per test case to stdout in the format `{ "test": "<name>", "status": "<pass|fail>", "http_status": <n>, "latency_ms": <n>, "slot": "green", "run_id": "<RUN_ID>" }` so results are captured in the GitHub Actions log and any downstream log aggregator.
5. WHERE the smoke test suite is defined in `k8s/smoke-tests/runner.sh`, THE SYSTEM SHALL assert at minimum: `GET /healthz` returns HTTP 200, `GET /readyz` returns HTTP 200, and `GET /api/v1/status` returns HTTP 200 with a non-empty JSON body (validated via `jq 'keys | length > 0'`).
6. IF the smoke-test pod does not reach `Running` phase within 60 seconds of creation, THE SYSTEM SHALL treat the pod-startup failure as a smoke test failure, exit the `smoke-test` job with a non-zero code, and trigger the `rollback` job rather than leaving the pipeline in an indeterminate state.

### Requirement 4: Zero-Downtime Traffic Switch

**User Story:** As an SRE, I want production traffic switched from the blue slot to the green slot atomically via a Kubernetes Service selector patch, so that no user requests are dropped during the deployment.

#### Acceptance Criteria

1. WHEN the `smoke-test` job succeeds, THE SYSTEM SHALL patch the `app-production` Service selector from `slot: blue` to `slot: green` using `kubectl patch service app-production -n production -p '{"spec":{"selector":{"slot":"green"}}}'` in the `switch-traffic` job.
2. WHEN the Service selector patch is applied, THE SYSTEM SHALL verify within 30 seconds that all ready `app-green` pods appear in the output of `kubectl get endpoints app-production -n production`.
3. WHILE the Service patch is being applied, THE SYSTEM SHALL NOT restart, scale, or modify the `app-blue` Deployment so that blue pods continue to handle any in-flight HTTP connections that were established before the selector change propagates.
4. IF the endpoint verification does not confirm that all green pods are registered in the `app-production` Endpoints object within 30 seconds, THE SYSTEM SHALL trigger the `rollback` job to revert the Service selector to `slot: blue` and fail the `switch-traffic` job.
5. WHEN the traffic switch and endpoint verification both succeed, THE SYSTEM SHALL write the value `green` to the GCP Secret Manager secret `/production/app/active-slot` so that the next pipeline run can determine the current active slot without querying the cluster.

### Requirement 5: Automated Rollback on Failure

**User Story:** As a platform engineer, I want the pipeline to automatically revert production traffic to the blue slot whenever the green deployment, smoke tests, or traffic verification fails, so that the blast radius of a failed release is minimised without manual intervention.

#### Acceptance Criteria

1. IF the `deploy-green`, `smoke-test`, or `switch-traffic` job fails for any reason, THE SYSTEM SHALL execute the `rollback` job (configured with `if: failure()`) and patch the `app-production` Service selector back to `slot: blue` within 30 seconds of the failure being detected.
2. WHEN the `rollback` job executes, THE SYSTEM SHALL NOT delete or scale down the `app-green` Deployment, preserving it and its logs for post-mortem investigation.
3. WHEN the `rollback` job completes, THE SYSTEM SHALL post a GitHub Deployment status event with `state: failure` and a URL linking to the failed workflow run, and send a notification to the `#deployments` Slack channel via the `SLACK_DEPLOY_WEBHOOK` secret.
4. IF the `rollback` job itself fails to revert the Service selector, THE SYSTEM SHALL create a GitHub issue in the application repository with label `p0-incident` and title `[AUTO] Rollback failed — run ${{ github.run_id }}`, and send a PagerDuty event via the Events API v2 to page the on-call SRE.
5. WHERE a rollback has been performed, THE SYSTEM SHALL annotate the `app-green` Deployment with `deploy.kiro-kit/rollback-reason: <failed-stage>` and `deploy.kiro-kit/rollback-timestamp: <ISO-8601>` so the incident context is traceable in Kubernetes audit logs and cluster-level tooling.

### Requirement 6: Concurrent Deployment Guard

**User Story:** As a platform engineer, I want the pipeline to prevent multiple simultaneous deployments to the same environment, so that race conditions between competing blue-green slot switches cannot leave the active-slot state corrupted.

#### Acceptance Criteria

1. WHEN a `deploy` workflow run is triggered while another `deploy` workflow targeting the `production` environment is already running, THE SYSTEM SHALL queue the new run using the GitHub Actions `concurrency` group `deploy-production` with `cancel-in-progress: false`; the in-progress run SHALL NOT be cancelled.
2. WHEN a `deploy-green` job starts, THE SYSTEM SHALL create a ConfigMap named `deploy-lock` in the `production` namespace containing the keys `run-id: ${{ github.run_id }}` and `started-at: <ISO-8601>` before modifying any Kubernetes workload.
3. IF a `deploy-lock` ConfigMap already exists and its `started-at` timestamp is less than 30 minutes old when a new job attempts to acquire the lock, THE SYSTEM SHALL exit the `deploy-green` job with an error message indicating the lock holder's run ID.
4. IF a workflow run is cancelled mid-pipeline by any means (force-push, manual cancellation, or timeout), THE SYSTEM SHALL execute a cleanup step that deletes the `deploy-lock` ConfigMap and records the cancellation event as an annotation on whichever slot was active at the time of cancellation.

### Requirement 7: Least-Privilege CI/CD Security

**User Story:** As a security engineer, I want all CI/CD pipeline steps to operate under narrowly scoped identities with no long-lived credentials stored in the repository, so that a compromised workflow cannot escalate privileges or exfiltrate secrets beyond the `production` namespace.

#### Acceptance Criteria

1. WHERE GitHub Actions workflow YAML files are defined, THE SYSTEM SHALL use OIDC Workload Identity Federation (`permissions: id-token: write`) to obtain short-lived GKE credentials; no static service-account JSON key files or `GOOGLE_CREDENTIALS` secrets SHALL be stored in the repository or GitHub Actions secrets.
2. WHEN the `build` job pushes an image to `ghcr.io`, THE SYSTEM SHALL use only the automatically provided `GITHUB_TOKEN` with `packages: write` permission; no personal access tokens or deploy keys SHALL be used.
3. WHERE Kubernetes RBAC is configured for the CI pipeline, THE SYSTEM SHALL bind the `ci-deployer` ServiceAccount to a namespaced Role (not a ClusterRole) that grants only `get`, `list`, `patch`, `update` on `deployments` and `services`; `get`, `list`, `create`, `delete` on `configmaps` and `pods`; and `get`, `list` on `endpoints` — all scoped to the `production` namespace only.
4. WHEN Terraform runs in the `plan-infra` and `deploy-green` jobs, THE SYSTEM SHALL authenticate as the dedicated GCP service account `tf-deployer@<project>.iam.gserviceaccount.com` granted only the IAM roles required to manage the declared resources; `roles/editor` and `roles/owner` SHALL NOT be granted.
5. IF a `tfsec` or `checkov` static scan of the Terraform plan detects a finding of HIGH or CRITICAL severity, THE SYSTEM SHALL fail the `plan-infra` job and block the `deploy-green` job from executing until the finding is remediated and the plan re-run.

# Implementation Plan: Blue-Green Deployment

## Overview

This plan delivers the Blue-Green Deployment pipeline in six incremental phases. Each phase produces a testable artifact — a passing Terraform plan, a working GitHub Actions job, or a verified Kubernetes state — so that progress can be confirmed at every step rather than only at the end.

Tasks within a phase that share no file-level dependency can run in parallel. Tasks marked `- [ ]*` are validation checkpoints and should be confirmed before advancing to the next phase.

Traceability tags use the format `R<N>.<AC>` where `N` is the Requirement number and `AC` is the Acceptance Criterion number from `requirements.md`.

## Tasks

- [ ] 1. Repository Layout and Terraform Foundation
  - [ ] 1.1 Create the `infrastructure/` directory tree: `modules/gke-nodepool/` (main.tf, variables.tf, outputs.tf), `modules/k8s-rbac/` (main.tf, variables.tf), `environments/production/` (backend.tf, main.tf, variables.tf, terraform.tfvars), and `workspaces/blue.tfvars` + `workspaces/green.tfvars`
  - [ ] 1.2 Configure the GCS remote state backend in `infrastructure/environments/production/backend.tf` with `bucket = "myapp-tf-state"` and `prefix = "production"`; run `terraform init` to confirm bucket connectivity and create the `.terraform.lock.hcl` file
  - [ ] 1.3 Implement the `modules/gke-nodepool` module to manage a `google_container_node_pool` resource; expose input variables `var.slot` ("blue"|"green"), `var.node_count` (default 3), and `var.machine_type` (default "e2-standard-4"); output the node pool name and self-link
  - [ ] 1.4 Create the `green` Terraform workspace with `terraform workspace new green` and validate that `terraform plan -var-file=workspaces/green.tfvars` exits zero on a fresh cluster with no resources created yet
  - [ ] 1.5 Create the dedicated GCP service account `tf-deployer@<project>.iam.gserviceaccount.com` and grant only `roles/container.nodePoolAdmin` and `roles/iam.serviceAccountUser`; confirm no `roles/editor` or `roles/owner` bindings exist via `gcloud projects get-iam-policy <project> --flatten=bindings --filter="bindings.members:tf-deployer"`
  - [ ]* Validate: `terraform validate` on `environments/production/` reports no errors; `tfsec infrastructure/ --minimum-severity HIGH` and `checkov -d infrastructure/ --compact --quiet` both report zero findings
  - _Requirements: R2.4, R7.4, R7.5_

- [ ] 2. Kubernetes Namespace, RBAC, and OIDC Identity
  - [ ] 2.1 Create `k8s/production/namespace.yaml` defining the `production` Namespace with labels `env: production` and `managed-by: kiro-kit`; apply with `kubectl apply -f k8s/production/namespace.yaml`
  - [ ] 2.2 Implement `infrastructure/modules/k8s-rbac/main.tf` to create the `ci-deployer` ServiceAccount, the `ci-deployer-role` Role, and the `ci-deployer-rb` RoleBinding — all scoped to the `production` namespace; grant only the verbs specified in the design's RBAC Role definition (no Secrets, ClusterRoles, or cross-namespace access)
  - [ ] 2.3 Configure the GCP Workload Identity Pool (`github` pool, `github` provider) to trust OIDC tokens from `https://token.actions.githubusercontent.com` with attribute condition `attribute.repository == "<org>/<repo>"`; bind the pool to `ci-deployer@<project>.iam.gserviceaccount.com` with the `roles/iam.workloadIdentityUser` role
  - [ ] 2.4 Add the `WIF_PROVIDER` and `TF_DEPLOYER_SA` GitHub Actions variables (not secrets) to the repository so workflow YAML can reference them without embedding project IDs in source
  - [ ]* Validate: run `kubectl auth can-i patch deployments --namespace production --as system:serviceaccount:production:ci-deployer`; confirm it returns `yes`. Then run `kubectl auth can-i create clusterroles --as system:serviceaccount:production:ci-deployer`; confirm it returns `no`
  - _Requirements: R7.1, R7.2, R7.3_

- [ ] 3. Kubernetes Workload Manifests
  - [ ] 3.1 Create `k8s/production/blue/deployment.yaml` for the `app-blue` Deployment: 3 replicas, `slot: blue` pod label, `imagePullPolicy: Always`, readiness probe on `GET /readyz:8080` (`initialDelaySeconds: 10`, `periodSeconds: 5`, `failureThreshold: 3`), liveness probe on `GET /healthz:8080` (`initialDelaySeconds: 15`, `periodSeconds: 10`); pin the image to the last known-good SHA digest
  - [ ] 3.2 Create `k8s/production/green/deployment.yaml` for the `app-green` Deployment: identical structure to blue but `slot: green` label and `image: ${IMAGE_REF}` placeholder substituted by CI via `envsubst`; include the annotation `deploy.kiro-kit/slot: green` on the Deployment metadata
  - [ ] 3.3 Create `k8s/production/service.yaml` for the `app-production` Service: `selector: { app: myapp, slot: blue }` (initial state), `port: 80`, `targetPort: 8080`, `type: ClusterIP`; document the selector field with a comment noting it is the traffic-switch toggle
  - [ ] 3.4 Create `k8s/production/service-green-internal.yaml` for the `app-green-svc` ClusterIP Service: `selector: { app: myapp, slot: green }`, same port mapping; add annotation `kiro-kit/usage: smoke-tests-only` to discourage accidental use outside CI
  - [ ] 3.5 Create `k8s/production/ingress.yaml` for the `app-ingress` Ingress: host `app.example.com`, TLS secret `app-tls`, backend `serviceName: app-production`, `servicePort: 80`; annotate with `kubernetes.io/ingress.class: nginx`
  - [ ] 3.6 Apply the blue Deployment, both Services, and the Ingress; run `kubectl rollout status deployment/app-blue -n production` and `kubectl get endpoints app-production -n production` to confirm 3 blue pod IPs are registered
  - _Requirements: R2.1, R2.5, R3.1, R4.1, R4.3_

- [ ] 4. GitHub Actions CI/CD Workflow
  - [ ] 4.1 Create `.github/workflows/deploy.yml` with top-level `concurrency: { group: deploy-production, cancel-in-progress: false }` and workflow-level `permissions: { contents: read, packages: write, id-token: write, deployments: write }`; add environment variables `IMAGE_NAME`, `CLUSTER_NAME`, `CLUSTER_LOCATION`, `NAMESPACE`
  - [ ] 4.2 Implement the `build` job: multi-stage `docker build -t $IMAGE_NAME:sha-${{ github.sha }} .`, Trivy scan step using `aquasecurity/trivy-action@0.24.0` with `exit-code: '1'` and `severity: HIGH,CRITICAL` outputting `trivy-results.sarif`, push to `ghcr.io` using `GITHUB_TOKEN`, extract digest with `docker inspect`, and set `image-ref` job output to the digest-pinned reference
  - [ ] 4.3 Implement the `plan-infra` job (`needs: [build]`): authenticate with `google-github-actions/auth@v2` using `WIF_PROVIDER` and `TF_DEPLOYER_SA`, select the `green` Terraform workspace, run `terraform plan -var-file=../../workspaces/green.tfvars -out=tfplan`, run `tfsec` and `checkov` with `continue-on-error: false`, post the plan summary as a sticky PR comment using `marocchino/sticky-pull-request-comment`
  - [ ] 4.4 Implement the `deploy-green` job (`needs: [plan-infra]`): authenticate to GKE with `google-github-actions/get-gke-credentials@v2`, create the `deploy-lock` ConfigMap with `run-id` and `started-at` fields, run `terraform apply tfplan`, substitute `IMAGE_REF` into the green Deployment manifest with `envsubst`, apply with `kubectl apply -f - -n production`, and poll `kubectl rollout status deployment/app-green -n production --timeout=5m`
  - [ ] 4.5 Implement the `smoke-test` job (`needs: [deploy-green]`): authenticate to GKE, apply `k8s/smoke-tests/pod.yaml`, wait for pod Ready with `kubectl wait pod/smoke-test-runner -n production --for=condition=Ready --timeout=60s`, execute `runner.sh` via `kubectl exec`, and annotate the `app-green` Deployment with `deploy.kiro-kit/smoke-pass=true` on success or `false` on failure
  - [ ] 4.6 Implement the `switch-traffic` job (`needs: [smoke-test]`): authenticate to GKE, patch `app-production` Service selector to `slot: green`, poll `kubectl get endpoints app-production -n production` every 5 seconds until 3 addresses appear or 30-second timeout is reached, then write `green` to GCP Secret Manager path `/production/app/active-slot`
  - [ ] 4.7 Implement the `rollback` job (`needs: [deploy-green, smoke-test, switch-traffic]`, `if: failure()`): authenticate to GKE, patch `app-production` Service selector back to `slot: blue`, annotate `app-green` with `deploy.kiro-kit/rollback-reason` and `deploy.kiro-kit/rollback-timestamp`, delete the `deploy-lock` ConfigMap with `--ignore-not-found`, and POST to `SLACK_DEPLOY_WEBHOOK`; if the rollback job itself exits non-zero, use the GitHub API to create an issue labelled `p0-incident` and fire a PagerDuty Events API v2 alert
  - [ ]* Validate: push a commit to `main` with a passing application; confirm all six jobs appear in the GitHub Actions UI, `build` → `plan-infra` → `deploy-green` → `smoke-test` → `switch-traffic` all show green, `rollback` is skipped; then run `kubectl get endpoints app-production -n production` and confirm green pod IPs are listed
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R2.2, R2.3, R4.1, R4.2, R4.4, R4.5, R5.1, R5.3, R5.4, R5.5, R6.1, R6.2, R6.4_

- [ ] 5. Smoke Test Suite
  - [ ] 5.1 Create `k8s/smoke-tests/pod.yaml`: a Pod named `smoke-test-runner` in the `production` namespace using the `curlimages/curl:8.7.1` image, `restartPolicy: Never`, serviceAccountName `ci-deployer`, and a `volumeMount` for the `runner.sh` script injected from a ConfigMap
  - [ ] 5.2 Create `k8s/smoke-tests/runner.sh`: a Bash script that iterates over the three required test cases (`GET /healthz`, `GET /readyz`, `GET /api/v1/status` all against `http://app-green-svc`), calls `curl -sf --max-time 10` for each, emits a structured JSON log line per test using `printf`, and exits 1 on the first failure (or after all tests if collecting results for full reporting)
  - [ ] 5.3 Add the `/api/v1/status` test case body validation: after confirming HTTP 200, pipe the response body through `jq 'keys | length > 0'` and fail if the result is `false` or `jq` exits non-zero, emitting `"status": "fail"` with `"reason": "empty-body"` in the JSON log line
  - [ ] 5.4 Add pod-startup timeout guard at the top of `runner.sh`: if `kubectl wait pod/smoke-test-runner --for=condition=Ready --timeout=60s` (called from the `smoke-test` job before exec) returns non-zero, the job step exits 1 immediately with log message `{"test":"pod-startup","status":"fail","reason":"timeout","latency_ms":60000}`
  - [ ] 5.5 Package `runner.sh` as a Kubernetes ConfigMap (`k8s/smoke-tests/runner-configmap.yaml`) so the script can be updated without rebuilding the test pod image; mount it at `/smoke-tests/runner.sh` with mode `0755`
  - [ ]* Validate: manually deploy a known-bad image (one that returns 500 on `/api/v1/status`) to `app-green`; push a commit and confirm the `smoke-test` job fails, the `rollback` job runs, the `app-production` Service selector is reverted to `slot: blue`, the `app-green` Deployment is annotated with `deploy.kiro-kit/smoke-pass=false`, and a Slack notification appears in `#deployments`
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R5.2_

- [ ] 6. Observability, Alerting, and Security Hardening
  - [ ] 6.1 Create `k8s/production/monitoring/podmonitor.yaml` with two `PodMonitor` resources — one selecting `slot: blue` and one selecting `slot: green` — both scraping port `metrics` (9090) every 15 seconds and passing through the `slot` pod label to all time series
  - [ ] 6.2 Create `k8s/production/monitoring/alerts.yaml` as a `PrometheusRule` with four alert rules: `AppHighErrorRate` (P1, `http_errors_total` > 5 % for 1 min), `RollbackJobFailed` (P1, GitHub webhook-derived metric), `SmokeTestFailed` (P2, log-based metric `smoke_test_failures_total`), and `DeploymentTooSlow` (P3, total deploy duration > 12 min via `kube_deployment_created` timestamps)
  - [ ] 6.3 Import the Grafana dashboard JSON from `monitoring/dashboards/blue-green-deploy.json` containing panels: Traffic Split (time-series by `slot` label), Green Rollout Timeline (annotations from CI), Smoke Test Results (table), and Active Slot (single-stat from Secret Manager label)
  - [ ] 6.4 Add `tfsec` and `checkov` steps to the `plan-infra` job with `continue-on-error: false` so HIGH/CRITICAL IaC findings block `deploy-green`; upload scan reports as workflow artifacts named `tfsec-report.json` and `checkov-report.json`
  - [ ] 6.5 Upload the Trivy SARIF report in the `build` job to the GitHub Security tab using `github/codeql-action/upload-sarif@v3` with `category: container` so findings appear in the repository's Security → Code scanning view
  - [ ] 6.6 Write `docs/runbooks/blue-green-rollback.md` covering: how to determine the active slot (`kubectl get service app-production -n production -o jsonpath='{.spec.selector.slot}'`), the manual rollback `kubectl patch` command, how to release the `deploy-lock` ConfigMap if a pipeline was cancelled, and how to re-enable GitHub Actions workflows after a P0 incident freeze
  - [ ]* Validate: inject a synthetic Alertmanager alert with `amtool alert add --alertmanager.url=http://alertmanager:9093 alertname=AppHighErrorRate slot=green`; confirm a PagerDuty incident is created and a Slack notification appears in `#deployments` within 2 minutes
  - _Requirements: R5.3, R5.4, R6.3, R7.1, R7.4, R7.5_

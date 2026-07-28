# Implementation Plan: OAuth-Protected Remote MCP Server on AWS Lambda with AgentCore Gateway

## Overview

This plan builds the MCP server, its OAuth protection layer, the Terraform IaC modules, and the AgentCore Gateway registration in dependency order: repository scaffolding and local test loop, Cognito and ECR provisioning, Python server and tool implementations, Lambda packaging, Gateway registration, static analysis gates, end-to-end sandbox verification, and final documentation. Sub-tasks marked `- [ ]*` are test and validation gates that must pass before the parent task is considered complete. Estimated effort: 4–6 engineer-days for a single AI engineer.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Repository scaffolding and Docker Compose local test loop
  - [ ] 1.1 Create the directory structure: `src/tools/`, `tests/unit/`, `tests/integration/`, `tests/schemas/`, `infra/terraform/modules/{ecr,cognito,lambda,gateway}/`, `infra/terraform/environments/{sandbox,production}/`; add `.gitkeep` in empty leaf directories and a `.dockerignore` excluding `infra/`, `tests/`, and `.git/`.
  - [ ] 1.2 Write `Dockerfile`: `FROM public.ecr.aws/lambda/python:3.12`; `COPY requirements.txt`; `RUN pip install --no-cache-dir -r requirements.txt`; `COPY src/ ${LAMBDA_TASK_ROOT}/src/`; `CMD ["src.server.handler"]`; add `ARG BUILD_SHA` and `LABEL git_sha=$BUILD_SHA` for traceability.
  - [ ] 1.3 Write `docker-compose.yml` with service `mcp-server` (local `build: .`, `environment: TEST_MODE=true, LOG_LEVEL=DEBUG`, port `8000:8000`) and service `inspector` (image `mcp/inspector:latest`, port `5173:5173`, env `MCP_SERVER_URL=http://mcp-server:8000/mcp`, `depends_on: mcp-server`).
  - [ ] 1.4 Write `requirements.txt` pinning: `mcp[cli]>=1.3`, `python-jose[cryptography]>=3.3`, `httpx>=0.27`, `mangum>=0.17`, `aws-xray-sdk>=2.14`; add dev extras in `requirements-dev.txt` (`pytest`, `pytest-asyncio`, `httpx`, `moto[cognitoidp]`).
  - [ ]* 1.5 Run `docker compose build` and assert exit code 0; run `docker compose up -d` and assert `http://localhost:8000/mcp` returns HTTP 200 on `GET` within 10 seconds; run `docker compose down` and assert exit code 0.
  - _Requirements: R8.1, R8.4_

- [ ] 2. Terraform scaffolding, provider configuration, and version pins
  - [ ] 2.1 Create `infra/terraform/modules/<name>/versions.tf` in each of the four modules, pinning: `required_version = ">= 1.9"`, `aws = "~> 5.60"`, `awscc = "~> 1.10"` (for AgentCore Gateway resources); create `infra/terraform/.tflint.hcl` enabling `tflint-ruleset-aws >= 0.27` with `required_tags`, `aws_resource_missing_tags`, and `deprecated_resource` rules.
  - [ ] 2.2 Create `infra/terraform/environments/sandbox/providers.tf` with the `aws` provider block, `default_tags` block (keys: `Environment`, `Project`, `ManagedBy = "terraform"`, `Owner`), and OIDC-based role assumption via `assume_role_with_web_identity`; mirror the pattern in `environments/production/providers.tf`.
  - [ ] 2.3 Add `infra/terraform/environments/sandbox/variables.tf` declaring `image_uri` (string, no default — must be pinned per deployment), `environment = "sandbox"`, `project`, `owner`; add `infra/terraform/environments/sandbox/terraform.tfvars.example` with placeholder values.
  - [ ]* 2.4 Run `terraform validate` in each module directory (`ecr`, `cognito`, `lambda`, `gateway`); assert zero errors in all four.
  - _Requirements: R7.1, R7.2, R7.4_

- [ ] 3. Terraform module: `ecr` (ECR repository)
  - [ ] 3.1 Implement `infra/terraform/modules/ecr/main.tf`: `aws_ecr_repository` named `mcp-server-agentcore` with `image_tag_mutability = "IMMUTABLE"`; `aws_ecr_repository_policy` granting `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage` to the Lambda execution role ARN (passed via `var.lambda_execution_role_arn`); `aws_ecr_lifecycle_policy` retaining the last 30 tagged images and expiring untagged images after 1 day.
  - [ ] 3.2 Add `aws_ecr_registry_scanning_configuration` resource with `scan_type = "BASIC"` and a filter for `SCAN_ON_PUSH`; export `repository_url` and `repository_arn` in `outputs.tf`.
  - [ ]* 3.3 Run `tflint --module` on `modules/ecr/`; assert zero warnings. Run `checkov -d infra/terraform/modules/ecr/`; assert `CKV_AWS_163` (ECR scan on push) passes.
  - _Requirements: R1.1, R7.1, R7.3, R7.4_

- [ ] 4. Terraform module: `cognito` (User Pool, resource server, M2M client, Secrets Manager)
  - [ ] 4.1 Implement `infra/terraform/modules/cognito/main.tf` with `aws_cognito_user_pool` (`admin_create_user_only = true`, no user sign-in, MFA off), `aws_cognito_resource_server` (identifier `"mcp-server"`, scope `name = "tools:read"`, `description = "Grants permission to list and invoke MCP tools"`), and `aws_cognito_user_pool_client` (M2M, `allowed_oauth_flows = ["client_credentials"]`, `allowed_oauth_scopes = ["mcp-server/tools:read"]`, `generate_secret = true`, `access_token_validity = 1` hour).
  - [ ] 4.2 Add `aws_secretsmanager_secret` at name `"mcp-gateway/cognito-m2m-${var.environment}"` with `recovery_window_in_days = 7`; add `aws_secretsmanager_secret_version` storing `jsonencode({ client_id = ..., client_secret = ... })`; export `user_pool_id`, `user_pool_endpoint`, `m2m_client_id`, `token_url` (`"https://cognito-idp.{region}.amazonaws.com/{pool_id}/oauth2/token"`), and `m2m_secret_arn`.
  - [ ]* 4.3 Run `tflint --module` on `modules/cognito/`; assert zero warnings. Run `checkov -d infra/terraform/modules/cognito/`; assert `CKV_AWS_149` (Secrets Manager rotation enabled — or documented exception) and `CKV2_AWS_57` pass.
  - _Requirements: R2.4, R7.1, R7.3, R7.4_

- [ ] 5. Python MCP server — auth middleware and JWKS cache
  - [ ] 5.1 Implement `src/jwks_cache.py`: module-level `_cache: dict = {}` and `_expires_at: float = 0.0`; async `get_jwks() -> dict` that checks `time.monotonic() < _expires_at`, returns cached keys on hit, otherwise fetches `{COGNITO_ISSUER_URL}/.well-known/jwks.json` with `httpx.AsyncClient(timeout=5)`, updates `_cache` and `_expires_at = time.monotonic() + 300`, and raises `RuntimeError("JWKS endpoint unreachable")` on HTTP error.
  - [ ] 5.2 Implement `src/auth.py`: `BearerAuthMiddleware(BaseHTTPMiddleware)` with `dispatch(request, call_next)` — extract `Authorization` header; if absent or not `"Bearer "` prefix, return `JSONResponse(status_code=401, headers={"WWW-Authenticate": f'Bearer realm="mcp-server-agentcore", authorization_uri="{COGNITO_ISSUER_URL}/.well-known/openid-configuration"'}, content={"error": "missing_token", "message": "Bearer token required"})`; decode JWT with `python-jose`; check `REQUIRED_SCOPE` in `claims["scope"].split()`; on `JWTError` return 401 with `WWW-Authenticate: Bearer error="invalid_token"`.
  - [ ] 5.3 Implement `src/observability.py`: `log_request(request_id, tool_name, auth_result, duration_ms, **kwargs)` — `print(json.dumps({...}))` (Lambda captures stdout as CloudWatch Logs); `emit_auth_metric(failure_type)` — `boto3.client("cloudwatch").put_metric_data(...)` with namespace `f"MCPServer/{ENVIRONMENT}"` and dimension `FailureType`; `annotate_xray(tool_name)` — `xray_recorder.put_annotation("tool_name", tool_name)`.
  - [ ]* 5.4 Run `pytest tests/unit/test_auth.py tests/unit/test_jwks_cache.py -v`; assert all tests pass including: missing-token → 401 + correct `WWW-Authenticate`; expired JWT → 401; JWKS cache TTL expires and triggers re-fetch; concurrent async callers do not duplicate HTTP requests (use `asyncio.gather`).
  - _Requirements: R2.1, R2.2, R2.3, R2.5, R9.1, R9.2, R9.3_

- [ ] 6. Python MCP server — FastMCP wiring, tool implementations, and stub layer
  - [ ] 6.1 Implement `src/stub_data.py`: `STUB_ACCOUNT = {"account_id": "ACC-000001", "balance_usd": 1234.56, "currency": "USD", "last_updated_at": "2025-11-01T09:00:00Z"}`; `STUB_TRANSACTIONS = [{"transaction_id": "TXN-000001", "amount_usd": 50.00, "direction": "debit", "description": "Coffee", "posted_at": "2025-11-01T08:00:00Z"}, ...]` (3 entries); `_is_test_mode() -> bool` reads `os.getenv("TEST_MODE", "false").lower() == "true"`.
  - [ ] 6.2 Implement `src/tools/account.py` with `@mcp.tool() async def get_account_summary(account_id: str) -> dict` — validate against `^ACC-[0-9]{6}$`, raise `ValueError("invalid account_id format; expected ACC-NNNNNN")` on mismatch, return stub or backend data; implement `@mcp.tool() async def list_recent_transactions(account_id: str, limit: int = 10) -> dict` — clamp `limit` to 1–50 with `warning` field, validate `account_id`, return stub or backend data.
  - [ ] 6.3 Implement `src/server.py`: create `mcp = FastMCP("agentcore-demo")`; import tools from `src/tools/account`; build Starlette app with `BearerAuthMiddleware` added via `app.add_middleware(BearerAuthMiddleware)`; skip auth middleware when `TEST_MODE=true` (add an `if` guard so the Inspector loop works without Cognito); export `handler = Mangum(app, lifespan="off")`.
  - [ ]* 6.4 Run `pytest tests/unit/test_tools.py -v`; assert: `get_account_summary("ACC-000001")` returns `balance_usd=1234.56` in `TEST_MODE`; `get_account_summary("INVALID")` raises `ValueError`; `list_recent_transactions("ACC-000001", limit=100)` clamps to 50 and includes `"warning"` key; `list_recent_transactions("ACC-000001", limit=0)` clamps to 1.
  - [ ]* 6.5 Run `docker compose up -d && sleep 5`; call MCP Inspector's HTTP API: `curl -s http://localhost:5173/api/tools | jq '.tools | length'`; assert the result is `>= 2`; call `curl -s -X POST http://localhost:8000/mcp -H "Content-Type: application/json" -d '{"method":"tools/list"}'` and assert both tool names appear; `docker compose down`.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R4.1, R4.2, R4.3, R8.2, R8.3_

- [ ] 7. Terraform module: `lambda` (Lambda function, Function URL, IAM role, log group)
  - [ ] 7.1 Implement `infra/terraform/modules/lambda/main.tf`: `aws_kms_key` (for log group encryption, `deletion_window_in_days = 7`); `aws_cloudwatch_log_group` at `/aws/lambda/mcp-server-agentcore-${var.environment}` with `retention_in_days = var.log_retention_days` and `kms_key_id`; `aws_lambda_function` with `package_type = "Image"`, `image_uri = var.image_uri`, `timeout = var.timeout`, `memory_size = var.memory_size`, environment variables (`COGNITO_ISSUER_URL`, `COGNITO_AUDIENCE`, `COGNITO_REQUIRED_SCOPE`, `LOG_LEVEL = "INFO"`), `tracing_config { mode = "Active" }`.
  - [ ] 7.2 Add `aws_lambda_function_url` with `authorization_type = "NONE"` and `cors` block (`allow_headers = ["authorization", "content-type"]`, `allow_methods = ["GET", "POST"]`, `allow_origins = ["*"]`, `max_age = 300`); export `function_url`, `function_arn`, `function_name` in `outputs.tf`.
  - [ ] 7.3 Add `aws_iam_role` (`mcp-server-agentcore-exec-${var.environment}`) with `assume_role_policy` allowing `lambda.amazonaws.com`; attach inline policy granting `logs:CreateLogGroup`, `logs:CreateLogDelivery`, `logs:PutLogEvents`, `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `cloudwatch:PutMetricData` — all scoped to specific resource ARNs, not `*`.
  - [ ]* 7.4 Run `tflint --module` on `modules/lambda/`; assert zero warnings. Run `checkov -d infra/terraform/modules/lambda/`; assert `CKV_AWS_45` (no public Lambda resource policy), `CKV_AWS_50` (X-Ray tracing), and `CKV_AWS_158` (log group encrypted) all pass.
  - _Requirements: R1.2, R1.3, R7.1, R7.2, R7.3, R7.4, R9.1, R9.2_

- [ ] 8. Terraform module: `gateway` (AgentCore Gateway + MCP-server target)
  - [ ] 8.1 Implement `infra/terraform/modules/gateway/main.tf` with `variable "gateway_listing_mode"` (default `"STATIC"`, validation block with error message `"DYNAMIC listing mode disables semantic search and outbound 3LO; use STATIC"`); `awscc_bedrock_agentcore_gateway` named `"mcp-gateway-${var.environment}"`; `awscc_bedrock_agentcore_gateway_target` of type MCP-server with `url = var.mcp_server_url`, `listing_mode = var.gateway_listing_mode`, and outbound OAuth 2LO block referencing `var.cognito_token_url`, `var.cognito_m2m_client_id`, and `var.m2m_secret_arn`.
  - [ ] 8.2 Add `aws_cloudwatch_dashboard` resource `MCPServerDashboard-${var.environment}` in `modules/lambda/main.tf` (or a `modules/observability/main.tf`) containing widgets for: Lambda invocation count + error rate, p99 duration, `MCPServer/${env}/AuthFailures` by `FailureType`, Lambda `InitDuration` max, and X-Ray service map.
  - [ ]* 8.3 Run `tflint --module` on `modules/gateway/`; assert zero warnings. Verify the `validation` block fires correctly by running `terraform validate` with `gateway_listing_mode = "DYNAMIC"` (use a `-var` override) and asserting a non-zero exit code with the expected error message.
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R6.2, R7.1, R9.4_

- [ ] 9. Terraform static analysis — full module set
  - [ ] 9.1 Run `tflint --module --config infra/terraform/.tflint.hcl infra/terraform/` across all four modules and both environment roots; fix any warnings; assert final run produces zero warnings.
  - [ ] 9.2 Run `checkov -d infra/terraform/ --framework terraform --output json > checkov-report.json`; assert zero `HIGH` or `CRITICAL` failures across all checks: `CKV_AWS_163` (ECR scan), `CKV_AWS_149` (Secrets Manager rotation), `CKV_AWS_45` (Lambda not public), `CKV_AWS_158` (CloudWatch log group encrypted), `CKV_AWS_50` (Lambda X-Ray tracing).
  - [ ] 9.3 Run `hadolint Dockerfile`; assert zero warnings (pin apt packages: `DL3008`; pin pip packages: `DL3013`; no `latest` base tag: already using pinned `python:3.12`).
  - [ ]* 9.4 Run `pytest tests/unit/ -v --tb=short`; assert all unit tests pass (auth, tools, JWKS cache).
  - _Requirements: R7.2, R7.3_

- [ ] 10. Sandbox deployment and smoke verification
  - [ ] 10.1 Build and push the Lambda container image: `docker build --build-arg BUILD_SHA=$(git rev-parse --short HEAD) -t mcp-server-agentcore:$(git rev-parse --short HEAD) .`; authenticate to ECR (`aws ecr get-login-password | docker login --username AWS --password-stdin {account}.dkr.ecr.{region}.amazonaws.com`); push with the `${GIT_SHA}` tag; capture the image digest and set `TF_VAR_image_uri` to the digest-pinned URI.
  - [ ] 10.2 Run `terraform -chdir=infra/terraform/environments/sandbox init && terraform plan -out=sandbox.tfplan`; assert the plan creates the expected resource count across all four modules with no unexpected destroys; save the plan summary to `docs/sandbox-plan-summary.txt`.
  - [ ] 10.3 Apply the sandbox plan: `terraform apply sandbox.tfplan`; assert all resources reach the applied state; capture `terraform output -json > docs/sandbox-outputs.json`; extract `function_url` and `gateway_id` for subsequent tests.
  - [ ]* 10.4 Run the OAuth handshake integration test: `pytest tests/integration/test_oauth_handshake.py -v` — asserts HTTP 401 + `WWW-Authenticate` on missing-token request to the Function URL, HTTP 401 with `error="invalid_token"` on tampered JWT, HTTP 200 on valid Cognito M2M token.
  - _Requirements: R1.1, R1.2, R1.3, R2.1, R2.2, R2.3, R7.1_

- [ ] 11. End-to-end verification — Gateway integration and semantic discovery
  - [ ] 11.1 Run `pytest tests/integration/test_tool_invocation.py -v`: fetch Cognito M2M token; call `tools/list` via Gateway and assert both `get_account_summary` and `list_recent_transactions` are present; call `get_account_summary` with `account_id="ACC-000001"` via Gateway and assert `balance_usd` key is present in the response; call `list_recent_transactions` with `limit=3` and assert the response contains exactly 3 transaction objects.
  - [ ] 11.2 Verify semantic tool discovery: invoke `x_amz_bedrock_agentcore_search` against the sandbox Gateway with query `"show account balance"`; assert `get_account_summary` appears in the top-2 ranked results; invoke with query `"recent account activity"` and assert `list_recent_transactions` appears in the top-2 results.
  - [ ] 11.3 Verify the `DYNAMIC` mode guard: temporarily set `TF_VAR_gateway_listing_mode=DYNAMIC`; run `terraform plan`; assert a non-zero exit code and the message `"DYNAMIC listing mode disables semantic search and outbound 3LO; use STATIC"` in stderr; reset `TF_VAR_gateway_listing_mode` to `"STATIC"`.
  - [ ]* 11.4 Run `pytest tests/integration/ -v --tb=short`; assert all integration tests pass; save the test report to `docs/integration-test-report.txt`.
  - _Requirements: R5.1, R5.2, R5.3, R6.1, R6.2, R3.2, R3.3, R4.1, R4.2_

- [ ] 12. Documentation and handover
  - [ ] 12.1 Complete `docs/runbook.md` covering: how to build and push a new container image; how to update the Lambda function to a new image URI via `terraform apply`; how to rotate the Cognito M2M client secret (update Secrets Manager, re-register Gateway target); how to force a Gateway tool index refresh; and how to interpret the `MCPServerDashboard-${env}` dashboard widgets.
  - [ ] 12.2 Add a `docs/architecture-decision-record.md` covering: (a) Lambda + Function URL vs AgentCore Runtime as the hosting target — rationale for choosing Lambda (serverless scaling, no idle cost, Terraform-native, SigV4-compatible Function URL); (b) OAuth 2LO vs IAM SigV4 as the Gateway outbound auth — rationale for OAuth (portable across ALB/ECS/EKS in future, explicit scope enforcement); (c) `STATIC` vs `DYNAMIC` listing mode — rationale for STATIC (enables semantic search, required for 2LO outbound, tool index pre-built at registration).
  - [ ] 12.3 Update the project `README.md` with: prerequisites (Docker, Terraform ≥ 1.9, AWS CLI, Python 3.12), quick-start for the Inspector local loop (`docker compose up`), sandbox deployment instructions, and a link to the CloudWatch dashboard URL from `docs/sandbox-outputs.json`.
  - [ ]* 12.4 Verify the runbook is complete by executing each step in a clean sandbox shell and asserting no step requires information not present in the document; record any gaps as follow-up issues in the project tracker.
  - _Requirements: R1.1, R1.4, R5.1, R7.1, R8.1, R9.4_

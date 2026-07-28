# Implementation Plan: Supervisor / Worker Multi-Agent Orchestrator on AgentCore Runtime with A2A

## Overview

This plan delivers the orchestrator in dependency order: project scaffolding and shared types, AgentCore infrastructure modules, supervisor logic, worker agents, evaluation harness, end-to-end sandbox verification, and documentation. Sub-tasks marked `- [ ]*` are test/validation gates that must pass before the parent task is considered complete. Estimated effort: 8–10 engineer-days for an AI engineer working alone; 5–6 days with two engineers splitting supervisor and worker tracks.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Project scaffolding, shared types, and CI skeleton
  - [ ] 1.1 Create the directory tree: `src/supervisor/`, `src/workers/{researcher,coder,summariser,critic,synthesiser}/`, `src/workers/shared/`, `eval/`, `infra/terraform/modules/{runtime,gateway,memory,registry,observability}/`, `infra/terraform/environments/{sandbox,production}/`; add `pyproject.toml` with `[project.optional-dependencies]` groups `supervisor`, `workers`, and `eval`; pin `strands-agents>=0.3`, `httpx>=0.27`, `aws-xray-sdk>=2.13`, `boto3>=1.34`.
  - [ ] 1.2 Define shared dataclasses in `src/supervisor/models.py`: `SubTask(task_id: str, description: str, intent_label: str, depends_on: list[str], status: str)`, `Worker(worker_id: str, name: str, endpoint: str, capabilities: list[str], priority: int, status: str)`, `RunMetrics(session_id, user_id, total_tokens, total_iterations, workers_invoked, failed_subtasks, duration_ms, run_status)`.
  - [ ] 1.3 Create `src/workers/shared/agent_card.py`: `AgentCard` dataclass with all fields required by design; `serve_well_known(app: FastAPI, card: AgentCard)` that adds `GET /.well-known/agent.json` returning the card as JSON.
  - [ ] 1.4 Create `.github/workflows/ci.yml` with jobs: `lint` (ruff + mypy), `unit-tests` (pytest `tests/unit/`), `terraform-validate` (validate all modules), `checkov` (zero HIGH/CRITICAL); all jobs run on every pull request.
  - [ ]* 1.5 Run `pytest tests/unit/ --collect-only`; assert collection succeeds with zero errors (placeholder test files exist).
  - _Requirements: R1.3, R2.1_

- [ ] 2. Terraform module: `runtime` (AgentCore Runtime agent)
  - [ ] 2.1 Implement `infra/terraform/modules/runtime/main.tf` with `aws_bedrockagentcore_agent_runtime`, `aws_iam_role` + `aws_iam_role_policy` (allow `bedrock:InvokeModel`, `bedrock-agentcore:InvokeMemory`, `bedrock-agentcore:RetrieveMemory`, `bedrock-agentcore:InvokeGateway`, `dynamodb:Query`/`PutItem`/`UpdateItem` on registry table ARN, `xray:PutTraceSegments`, `logs:PutLogEvents`); no wildcard resource ARNs in production policies.
  - [ ] 2.2 Implement `infra/terraform/modules/runtime/variables.tf` (all inputs with `description` and `type`): `agent_name`, `image_uri`, `environment_variables` (map of string), `memory_arn`, `gateway_arn`, `registry_table_arn`, `environment`, `project`, `owner`.
  - [ ] 2.3 Implement `infra/terraform/modules/runtime/outputs.tf`: `runtime_endpoint`, `runtime_id`, `execution_role_arn`.
  - [ ]* 2.4 Run `terraform validate` in `modules/runtime/`; assert zero errors. Run `checkov -d infra/terraform/modules/runtime/`; assert zero HIGH/CRITICAL findings.
  - _Requirements: R1.1, R1.4, R7.1_

- [ ] 3. Terraform modules: `registry`, `memory`, `gateway`, `observability`
  - [ ] 3.1 Implement `infra/terraform/modules/registry/main.tf`: `aws_dynamodb_table` named `orchestrator-worker-registry-{environment}`, `billing_mode = "PAY_PER_REQUEST"`, `hash_key = "PK"` (string), `range_key = "SK"` (string), `server_side_encryption { enabled = true }`, `point_in_time_recovery { enabled = var.enable_pitr }`.
  - [ ] 3.2 Implement `infra/terraform/modules/memory/main.tf`: `aws_bedrockagentcore_memory` resource; namespace parameter matching `MEMORY_NAMESPACE` environment variable injected into Runtime agents.
  - [ ] 3.3 Implement `infra/terraform/modules/gateway/main.tf`: `aws_bedrockagentcore_gateway` with `listing_mode = "STATIC"` (do NOT use `DYNAMIC` — incompatible with semantic search and outbound 3LO); three `aws_bedrockagentcore_gateway_target` resources for Brave Search, doc-retrieval, and code-sandbox Lambda Function URLs, each with `authentication { type = "IAM_ROLE" }` (SigV4 — valid only for Lambda Function URLs, not ALB or EC2 targets).
  - [ ] 3.4 Implement `infra/terraform/modules/observability/main.tf`: `aws_cloudwatch_dashboard` (`OrchestratorDashboard-{environment}`) with all widgets from the design; `aws_cloudwatch_metric_alarm` for A2A error rate (threshold 20 %, 5-minute evaluation), `OrchestratorBudgetExceeded` (threshold 1), and `OrchestratorIterationCapHit` (threshold 1); `aws_sns_topic` (`orchestrator-ops-alerts-{environment}`) with `aws_sns_topic_subscription` for the ops email address.
  - [ ]* 3.5 Run `terraform validate` in each of `modules/registry/`, `modules/memory/`, `modules/gateway/`, `modules/observability/`; assert zero errors. Run `checkov` on all four; assert zero HIGH/CRITICAL (CKV_AWS_28 DynamoDB encryption, PITR in production).
  - _Requirements: R2.2, R5.1, R5.3, R6.1, R8.3, R8.4_

- [ ] 4. Supervisor: decomposer, router, and memory client
  - [ ] 4.1 Implement `src/supervisor/decomposer.py`: `decompose_request(user_request: str, model_id: str, bedrock_client) -> list[SubTask]` — builds a decomposition prompt, calls `bedrock:InvokeModel`, parses the JSON response into `SubTask` objects, validates `intent_label` against the vocabulary `{research, code, summarise, critique, synthesise}` (unknown labels default to `research`), and validates that `depends_on` references form a DAG (no cycles).
  - [ ] 4.2 Implement `src/supervisor/router.py`: `route_sub_task(intent_label: str, registry_table: str, dynamodb) -> Worker | None` — calls `dynamodb.Table.query(KeyConditionExpression=Key("PK").begins_with("WORKER#"), FilterExpression=Attr("status").eq("ACTIVE") & Attr("capabilities").contains(intent_label))`, sorts by `priority` ascending, returns first result or `None`.
  - [ ] 4.3 Implement `src/supervisor/memory_client.py`: `write_plan(session_id, plan)`, `write_result(task_id, result_text)`, `retrieve_summaries(user_id, top_k=5, min_relevance=0.7) -> list[dict]` — wraps AgentCore Memory SDK; on transient failure logs `WARN` and returns empty list (do not raise).
  - [ ]* 4.4 Run `pytest tests/unit/test_decomposer.py tests/unit/test_router.py`; assert all tests pass. Verify that `decomposer.py` rejects a circular `depends_on` chain with a `ValueError`.
  - _Requirements: R3.1, R3.2, R3.3, R6.2, R6.3, R6.4_

- [ ] 5. Supervisor: budget guard, loop detector, dispatcher, and synthesiser
  - [ ] 5.1 Implement `src/supervisor/budget_guard.py` (full implementation from the design): `BudgetGuard(max_tokens, max_iterations)` with `increment(tokens, iterations)`, `check_or_raise()`, `is_budget_exceeded()`, `is_iteration_cap_hit()`.
  - [ ] 5.2 Implement `src/supervisor/loop_detector.py`: `LoopDetector(threshold=2)` with `record(worker_id, task_desc)` and `is_loop(worker_id, task_desc) -> bool`; key is `sha256(worker_id + "::" + task_desc)[:16]`.
  - [ ] 5.3 Implement `src/supervisor/dispatcher.py`: `dispatch_concurrent(sub_tasks, workers, session_id, correlation_id, token, guard: BudgetGuard, detector: LoopDetector, max_concurrent=3) -> list[Result]` — topologically sorts sub-tasks by `depends_on`, runs independent batches with `asyncio.gather(limit=max_concurrent)`, checks `guard.check_or_raise()` and `detector.is_loop()` before each dispatch, handles `BudgetExceededError`/`IterationCapError` by aborting pending tasks.
  - [ ] 5.4 Implement `src/supervisor/synthesiser.py`: `synthesise(results: list[Result]) -> str` — aggregates `result_text` fields from all `DONE` results; appends a `partial_failures` summary listing non-`DONE` sub-tasks by `task_id` and `status`.
  - [ ]* 5.5 Run `pytest tests/unit/test_budget_guard.py tests/unit/test_loop_detector.py tests/unit/test_dispatcher.py`; assert all pass. Verify that the dispatcher halts at `MAX_ITERATIONS = 3` in a synthetic test with 10 sub-tasks.
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R4.3_

- [ ] 6. Supervisor: A2A client, observability, and main entry point
  - [ ] 6.1 Implement `src/supervisor/a2a_client.py`: `dispatch_task(endpoint, task_id, description, session_id, correlation_id, token, max_retries=2) -> dict` — sends A2A `tasks/send` JSON-RPC 2.0 request with `Authorization: Bearer {token}` and `metadata.correlation_id`; retries on HTTP 5xx with exponential backoff (initial 1 s, factor 2); raises `A2AError` after all retries exhausted.
  - [ ] 6.2 Implement `src/supervisor/observability.py`: `emit_run_metric(metrics: RunMetrics)` (EMF log publisher); `annotate_trace(correlation_id, session_id)` (X-Ray annotations); `emit_counter(metric_name: str, dimensions: dict)` for `OrchestratorBudgetExceeded`, `OrchestratorIterationCapHit`, `OrchestratorMemoryError`.
  - [ ] 6.3 Implement `src/supervisor/main.py`: Strands Agents `Agent` initialised with Claude 3.7 Sonnet model provider; `handler(event, context)` that orchestrates the full run — parse request → retrieve memory summaries → decompose → route → dispatch → synthesise → write long-term summary → emit EMF metric → return response; catch `BudgetExceededError`/`IterationCapError` to return partial results with appropriate `run_status`.
  - [ ]* 6.4 Run `pytest tests/unit/test_a2a_client.py`; assert retry logic fires on 5xx and does not fire on 4xx; assert `correlation_id` is present in every outbound request body.
  - _Requirements: R1.2, R1.3, R4.1, R4.2, R4.3, R4.4, R8.1, R8.2_

- [ ] 7. Worker agents and shared MCP server
  - [ ] 7.1 Implement `src/workers/shared/gateway_tools.py`: `build_gateway_tool_provider(endpoint: str, token: str)` — creates a Strands Agents MCP tool provider using `streamablehttp_client(endpoint)` (the AgentCore Gateway MCP endpoint served at the Gateway's HTTPS URL, consumed via streamable-HTTP transport); returns a provider that workers pass to their `Agent(tools=[provider])`.
  - [ ] 7.2 Implement `src/workers/shared/mcp_server.py`: `start_mcp_server(app)` — calls `mcp.run(transport="streamable-http")` bound to `0.0.0.0:8000/mcp` so the worker's Runtime container serves a supplemental MCP endpoint if needed.
  - [ ] 7.3 Implement each worker's `main.py` (`researcher`, `coder`, `summariser`, `critic`, `synthesiser`): Strands Agents `Agent` with Claude 3.7 Sonnet; FastAPI app serving agent card at `GET /.well-known/agent.json` (via `serve_well_known`); `POST /a2a/tasks/send` handler that validates the A2A JSON-RPC payload, invokes the agent, and returns `{jsonrpc: "2.0", result: {status: "completed", result: {text: "..."}}}` or `{..., result: {status: "failed", error: {...}}}`.
  - [ ] 7.4 Register all five worker agent cards in the sandbox registry table via a one-time Terraform `null_resource` / `local-exec` provisioner that calls `aws dynamodb put-item` for each card with `PK = WORKER#{worker_id}`, `SK = METADATA`, `status = "ACTIVE"`, `capabilities`, `priority`, and `endpoint`.
  - [ ]* 7.5 Run `pytest tests/unit/test_agent_card.py`; assert `serve_well_known` returns a valid agent card JSON with all required fields. Run `python -m pytest tests/unit/test_worker_handler.py` for each worker; assert the A2A response schema is valid and `status = "completed"` is returned for a trivial input.
  - _Requirements: R1.4, R2.1, R2.2, R5.1, R5.2, R5.3_

- [ ] 8. Container images and ECR push
  - [ ] 8.1 Write `Dockerfile.supervisor`: multi-stage build — `python:3.12-slim` builder installs `.[supervisor]` dependencies; final image copies `src/supervisor/`; `EXPOSE 8000`; `CMD ["python", "-m", "supervisor.main"]`; ensure the container does not run as root (add `USER 1000`).
  - [ ] 8.2 Write `Dockerfile.worker` (shared across all five workers, parameterised by `ARG WORKER_NAME`): installs `.[workers]` dependencies; copies `src/workers/shared/` and `src/workers/${WORKER_NAME}/`; `EXPOSE 8000`; `CMD ["python", "-m", "workers.${WORKER_NAME}.main"]`.
  - [ ] 8.3 Add `infra/terraform/modules/ecr/main.tf`: one `aws_ecr_repository` per image (`orchestrator-supervisor`, `orchestrator-worker-researcher`, etc.); `image_scanning_configuration { scan_on_push = true }`; `encryption_configuration { encryption_type = "AES256" }`.
  - [ ] 8.4 Add `scripts/build_and_push.sh`: builds and pushes all six images to ECR using `docker buildx build --platform linux/amd64`; tags with `{git_sha}` and `latest`.
  - [ ]* 8.5 Run `docker build -f Dockerfile.supervisor -t orchestrator-supervisor:test .` locally; assert build exits 0 and `docker run --rm orchestrator-supervisor:test python -c "from supervisor.main import handler; print('ok')"` prints `ok`.
  - _Requirements: R1.1, R1.4_

- [ ] 9. Sandbox environment wiring and deployment
  - [ ] 9.1 Implement `infra/terraform/environments/sandbox/main.tf`: instantiate all five modules (`runtime` × 6 for supervisor + 5 workers, `gateway`, `memory`, `registry`, `observability`); set `MAX_TOKENS_PER_RUN = 50000`, `MAX_ITERATIONS = 20`, `MAX_CONCURRENT_WORKERS = 3`; pass ECR image URIs from module outputs.
  - [ ] 9.2 Add `infra/terraform/environments/sandbox/providers.tf`: `aws` provider with `default_tags { tags = { Environment = "sandbox", Project = "orchestrator", ManagedBy = "terraform", Owner = var.owner } }` and OIDC-based role assumption via `assume_role_with_web_identity`.
  - [ ] 9.3 Run `terraform -chdir=infra/terraform/environments/sandbox init && terraform plan -out=sandbox.tfplan`; review plan for expected resource count (6 Runtime agents, 1 Gateway, 1 Memory, 1 DynamoDB table, 1 Dashboard, 3 Alarms, 1 SNS topic); save plan summary to `docs/sandbox-plan-summary.txt`.
  - [ ] 9.4 Run `terraform apply sandbox.tfplan`; assert all resources reach `CREATE_COMPLETE`; capture `terraform output -json > docs/sandbox-outputs.json`.
  - [ ]* 9.5 Invoke the supervisor endpoint with a minimal test payload using `curl -s -H "Authorization: Bearer $(aws bedrock-agentcore get-runtime-token ...)" -d '{"user_request":"ping","session_id":"test-001"}' $(jq -r .supervisor_endpoint docs/sandbox-outputs.json)`; assert HTTP 200 and `run_status` field present in response body.
  - _Requirements: R1.1, R1.2, R1.3, R2.2, R5.1_

- [ ] 10. End-to-end orchestration verification
  - [ ] 10.1 Run smoke test: POST `"Explain what Strands Agents is and give a Python code example."` to the sandbox supervisor; assert HTTP 200, `run_status = "COMPLETED"`, `workers_invoked` contains both `"researcher"` and `"coder"`, and `answer` is non-empty.
  - [ ] 10.2 Run multi-worker routing test: POST a compound request requiring `research` + `summarise` + `critique`; assert all three workers appear in `workers_invoked`; assert no sub-task has `status` of `FAILED`, `TIMEOUT`, or `UNROUTABLE`.
  - [ ] 10.3 Run budget cap test: temporarily set `MAX_TOKENS_PER_RUN = 100` by updating the supervisor Runtime environment variable; POST a complex request; assert response `run_status = "BUDGET_EXCEEDED"` and `partial_failures` list is non-empty; restore `MAX_TOKENS_PER_RUN` to `50000`.
  - [ ] 10.4 Run memory persistence test: complete a session with `user_id = "eval-user-001"`; start a new session with the same `user_id`; assert the supervisor's X-Ray trace for the second session contains a `memory.retrieve` subsegment with `records_returned >= 1`.
  - [ ] 10.5 Run worker unavailability test: update registry item `PK = WORKER#researcher, SK = METADATA` to `status = "INACTIVE"` via `aws dynamodb update-item`; POST a `research`-only request; assert response includes `UNROUTABLE` in `partial_failures`; restore `status = "ACTIVE"`.
  - [ ] 10.6 Verify A2A error-rate alarm: temporarily set one worker's `endpoint` to an unreachable URL; send 10 requests that route to that worker; assert `OrchestratorA2AErrorRate` alarm transitions to `ALARM` state in CloudWatch within 5 minutes; restore the endpoint.
  - [ ]* 10.7 Run `checkov -d infra/terraform/ --framework terraform`; assert zero HIGH/CRITICAL findings across all modules.
  - _Requirements: R3.3, R3.4, R4.1, R4.2, R4.3, R6.2, R6.3, R7.2, R8.4_

- [ ] 11. Evaluation harness and CI gate
  - [ ] 11.1 Implement `eval/judge.py`: `score_with_judge(response: str, criteria: list[str]) -> JudgeScores` — calls Bedrock LLM-as-a-Judge (GA 20 March 2025) via `bedrock:InvokeModel` with the standard judge prompt template for `helpfulness`, `correctness`, and `harmfulness`; returns a `JudgeScores` dataclass with float fields for quality metrics and a boolean `harmfulness` field.
  - [ ] 11.2 Implement `eval/harness.py` (full implementation from the design): `run_evaluation(supervisor_endpoint, token, golden_path, output_dir) -> dict`; replay all 50 golden cases; compute per-case F1 (expected vs actual `workers_invoked`); call `score_with_judge` for each final answer; aggregate `pass_rate`, `f1_score`, `avg_helpfulness`, `avg_correctness`, `harmful_count`; write `eval/reports/{run_id}.json`; exit non-zero if `pass_rate < 0.85` or `harmful_count > 0`.
  - [ ] 11.3 Populate `eval/golden_dataset.json` with 50 labelled test cases covering all five intent labels and combinations; each case must include `id`, `input`, `expected_workers` (list), and `expected_answer_keywords` (list of strings the final answer should contain).
  - [ ] 11.4 Add a `evaluate` job to `.github/workflows/ci.yml` that runs after sandbox deployment (triggered on push to `main` only): calls `python -m eval.harness` with the sandbox endpoint; uploads the JSON report as a build artefact; fails the job if the harness exits non-zero, blocking promotion to the staging Terraform workspace.
  - [ ]* 11.5 Run `python -m eval.harness --endpoint <sandbox_endpoint> --golden eval/golden_dataset.json`; assert exit code 0, `pass_rate >= 0.85`, `avg_helpfulness >= 4.0`, `avg_correctness >= 3.5`, and `harmful_count == 0`; confirm report written to `eval/reports/{run_id}.json`.
  - _Requirements: R9.1, R9.2, R9.3, R9.4_

- [ ] 12. Documentation
  - [ ] 12.1 Update `docs/system-architecture.md` to add the Multi-Agent Orchestrator as a component in the system landscape section, linking to `presets/ai-engineer/specs/example-multi-agent-orchestrator/design.md` and the sandbox dashboard URL from `docs/sandbox-outputs.json`.
  - [ ] 12.2 Author `docs/adr-001-runtime-vs-harness.md` following the MADR template: document the decision to use AgentCore Runtime for all agents now, with Harness as the recommended migration path for stateless workers once it reaches further maturity; link [AgentCore release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html).
  - [ ] 12.3 Author `docs/adr-002-static-vs-dynamic-gateway-listing.md`: document the decision to use `STATIC` listing mode on the Gateway and why `DYNAMIC` is excluded (incompatible with `x_amz_bedrock_agentcore_search` semantic discovery and outbound 3-legged OAuth).
  - [ ] 12.4 Author `docs/adr-003-sigv4-target-scope.md`: document that Gateway outbound SigV4 authentication is restricted to Lambda Function URL targets; record that ALB-fronted and direct EC2 targets are excluded and must use API key or OAuth auth instead.
  - [ ] 12.5 Add a `RUNBOOK.md` in `docs/` covering: how to update a worker's agent card in the registry, how to add a new worker Runtime, how to replay a failed orchestration run from Memory, and how to interpret the `OrchestratorDashboard` alarm states.
  - _Requirements: R1.1, R5.1, R5.3, R9.3_

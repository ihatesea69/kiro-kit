# Requirements Document

## Introduction

This document defines the requirements for a **Supervisor / Worker Multi-Agent Orchestrator** built on Amazon Bedrock AgentCore Runtime using the Strands Agents SDK and the Agent-to-Agent (A2A) protocol. A single supervisor agent receives a user request, decomposes it into sub-tasks, and delegates each sub-task to the most appropriate specialised worker agent. Every worker is deployed as its own AgentCore Runtime agent and is reached exclusively over A2A. Shared tools — web search, code execution, document retrieval — are exposed through a single AgentCore Gateway endpoint that serves an MCP-compatible tool catalogue. Cross-turn state is persisted in AgentCore Memory so that multi-turn conversations accumulate context without re-sending full histories. Hard budget and iteration caps are enforced at every layer to bound cost and prevent runaway loops.

The deliverables of this specification are **infrastructure-as-code artefacts and application source files**: a Terraform CDK module deploying all AgentCore resources, Python source for the supervisor and each worker, an A2A agent-card registry, routing-policy configuration, observability dashboards, and a deterministic evaluation harness that verifies the correct worker was invoked for a given input.

## Glossary

| Term | Definition |
|------|-----------|
| AgentCore Runtime | Amazon Bedrock AgentCore's serverless compute layer for hosting containerised or harness-based agents; GA October 2025 across nine regions. |
| AgentCore Harness | A no-infrastructure deployment path (GA June 2026) that removes the need to build a container; agents are deployed via `CreateHarness`/`InvokeHarness`. |
| A2A | Agent-to-Agent protocol; an open HTTP-based standard for inter-agent communication using JSON-RPC 2.0 over server-sent events or HTTP responses. |
| Agent Card | A JSON document (hosted at `/.well-known/agent.json` on each worker's Runtime endpoint) declaring the agent's identity, capabilities, supported input/output modes, and A2A endpoint. |
| Supervisor Agent | The root agent built with Strands Agents that decomposes a user request, selects workers via routing policy, and aggregates their responses. |
| Worker Agent | A specialised agent (researcher, coder, summariser, critic) deployed on its own AgentCore Runtime instance and registered in the agent-card registry. |
| Routing Policy | A rules-based function inside the supervisor that maps intent labels — derived from a lightweight classifier call — to a ranked list of candidate workers. |
| AgentCore Gateway | The managed MCP proxy that indexes third-party tools and exposes them via a single authenticated endpoint; pricing: $0.005 / 1,000 API invocations + $0.02 / 100 tools indexed / month. |
| AgentCore Memory | The managed memory store providing short-term event buffers ($0.25 / 1,000 events) and long-term record storage ($0.75 / 1,000 records / month; $0.50 / 1,000 retrievals). |
| MCP | Model Context Protocol; an open standard for exposing tools to LLM agents over streamable-HTTP or SSE transports. |
| Budget Cap | A hard ceiling on the total number of LLM tokens or AgentCore invocations per orchestration run, enforced by the supervisor before issuing further A2A calls. |
| Loop Detection | A mechanism that inspects the supervisor's delegation history within a turn and aborts if the same worker–task pair has been invoked more than a configurable threshold. |
| Strands Agents | AWS's lightweight code-first agent SDK; uses a model-driven tool loop, supports multi-agent patterns, and includes observability hooks for per-span tracing. |
| LLM-as-a-Judge | Amazon Bedrock's GA evaluation feature (20 March 2025) that scores agent responses on helpfulness, correctness, and harmfulness using a judge model. |
| SigV4 | AWS Signature Version 4; the request-signing scheme used by AgentCore Gateway for outbound MCP target authentication — valid only for API Gateway and Lambda Function URL targets. |

## Out of Scope

- Streaming token-by-token responses from worker agents to end-users; this specification covers request/response A2A exchanges only.
- Fine-tuning or custom model training for the routing classifier; intent labels are produced by a zero-shot prompt against the supervisor's base model.
- Multi-region active-active deployment of workers; all Runtime agents are deployed to a single region with per-AZ redundancy provided by the Runtime service.
- Human-in-the-loop approval steps within an orchestration run; approval flows are handled by a separate workflow specification.
- AgentCore Browser Tool and Code Interpreter resource configurations; compute pricing for those components is not hardcoded here — see [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/).
- Authentication of end-user identities at the API layer; caller authorisation is delegated to the API Gateway JWT authoriser defined in the platform security specification.

## Requirements

### Requirement 1: Supervisor Agent Deployment

**User Story:** As an AI engineer, I want the supervisor agent deployed as an AgentCore Runtime agent so that it is serverless, auto-scales with request volume, and is reachable via a stable HTTPS endpoint with OAuth-protected access.

#### Acceptance Criteria

1. WHEN the Terraform stack is applied, THE SYSTEM SHALL create an AgentCore Runtime agent named `orchestrator-supervisor-{environment}` in the target region with the Strands Agents framework, Claude 3.7 Sonnet as the default model, and an IAM execution role scoped to invoke AgentCore Memory, AgentCore Gateway, and the A2A endpoints of registered workers.
2. WHEN a caller submits a request to the supervisor's Runtime endpoint without a valid Bearer token, THE SYSTEM SHALL return HTTP 401 with a `WWW-Authenticate: Bearer realm="orchestrator-supervisor"` header (RFC 7235) and the auth-server metadata URL discoverable via `GetRuntimeProtectedResourceMetadata`.
3. WHEN the supervisor agent is started, THE SYSTEM SHALL read its runtime configuration — worker registry URL, Gateway MCP endpoint, Memory namespace, budget cap, and max-iterations ceiling — from environment variables injected by the Runtime: `WORKER_REGISTRY_URL`, `GATEWAY_MCP_ENDPOINT`, `MEMORY_NAMESPACE`, `MAX_TOKENS_PER_RUN`, and `MAX_ITERATIONS`.
4. WHEN the supervisor container is built, THE SYSTEM SHALL pass all required health-check and invocation interfaces on the Runtime's expected port and path, and the MCP server within the container SHALL listen on `0.0.0.0:8000/mcp` using `mcp.run(transport="streamable-http")` for any supplemental tool endpoints.

---

### Requirement 2: Worker Agent Registration and A2A Discovery

**User Story:** As an AI engineer, I want each worker agent to publish a standards-compliant agent card and be registered in a central registry so that the supervisor can discover, verify, and invoke any worker at runtime without hard-coded endpoint URLs.

#### Acceptance Criteria

1. WHEN a worker agent Runtime is deployed, THE SYSTEM SHALL serve a valid agent card at `GET /.well-known/agent.json` on the worker's Runtime HTTPS endpoint, containing at minimum: `id` (a UUID v4 stable across deployments), `name`, `description`, `version`, `capabilities` (list of intent labels the worker handles), `endpoint` (the Runtime HTTPS invocation URL), and `a2a_protocol_version` (`"1.0"`).
2. WHEN the Terraform stack is applied, THE SYSTEM SHALL upsert each worker's agent card into the agent-card registry table (`orchestrator-worker-registry-{environment}` DynamoDB table) with `PK = WORKER#{worker_id}` and `SK = METADATA`, so that the supervisor can retrieve all registered workers with a single `Query` call.
3. WHEN the supervisor queries the registry for a given set of intent labels, THE SYSTEM SHALL return workers whose `capabilities` list contains at least one matching label, ordered by a `priority` attribute stored alongside the card; workers with `status = "INACTIVE"` SHALL be excluded from results.
4. WHEN a worker's Runtime endpoint becomes unreachable (A2A call returns a connection error or HTTP 503), THE SYSTEM SHALL mark that worker's registry entry `status = "DEGRADED"` in DynamoDB and exclude it from routing for the duration of the current supervisor session.

---

### Requirement 3: Request Decomposition and Routing Policy

**User Story:** As an AI engineer, I want the supervisor to decompose a user request into labelled sub-tasks and route each sub-task to the correct worker using a deterministic policy, so that delegation decisions are auditable and reproducible given the same input.

#### Acceptance Criteria

1. WHEN the supervisor receives a user request, THE SYSTEM SHALL invoke a decomposition prompt against the supervisor's base model and produce a structured plan containing one or more sub-tasks, each with: `task_id` (UUID v4), `description` (natural-language instruction for the worker), `intent_label` (one of `research`, `code`, `summarise`, `critique`, or `synthesise`), and `depends_on` (list of upstream `task_id` values that must complete first).
2. WHEN the decomposition plan is produced, THE SYSTEM SHALL serialise the plan to AgentCore Memory under key `PLAN#{session_id}` using a short-term event write, so that it is recoverable if the supervisor container restarts mid-run.
3. WHEN the routing policy evaluates a sub-task's `intent_label`, THE SYSTEM SHALL select the highest-priority active worker whose `capabilities` list includes the label; if no active worker matches, THE SYSTEM SHALL mark the sub-task `status = "UNROUTABLE"` and return a partial result to the caller with an explanatory message rather than raising an unhandled exception.
4. WHEN two or more sub-tasks have no mutual `depends_on` entries, THE SYSTEM SHALL dispatch them concurrently using `asyncio.gather`, up to the `MAX_CONCURRENT_WORKERS` limit (default `3`) read from the environment.

---

### Requirement 4: Worker Invocation over A2A

**User Story:** As an AI engineer, I want the supervisor to invoke each worker over the A2A protocol so that workers are decoupled from the supervisor's implementation language and can be replaced or versioned independently.

#### Acceptance Criteria

1. WHEN the supervisor dispatches a sub-task to a worker, THE SYSTEM SHALL send an A2A `tasks/send` JSON-RPC 2.0 request to the worker's `endpoint` URL, including a `task` object with `id` (the sub-task `task_id`), `message` (the sub-task `description`), `sessionId` (the top-level session ID), and an `Authorization: Bearer {token}` header obtained from the supervisor's IAM-issued OIDC token.
2. WHEN a worker returns an A2A response with `status = "completed"`, THE SYSTEM SHALL extract the `result.text` field, store it in AgentCore Memory under key `RESULT#{task_id}`, and mark the sub-task `status = "DONE"` in the in-memory plan state.
3. WHEN a worker returns an A2A response with `status = "failed"` or the HTTP response code is 4xx/5xx, THE SYSTEM SHALL retry the A2A call up to two times with exponential backoff (initial delay 1 s, factor 2), and if all retries are exhausted, mark the sub-task `status = "FAILED"` and continue orchestrating remaining independent sub-tasks rather than aborting the entire run.
4. WHEN the supervisor dispatches a sub-task to a worker, THE SYSTEM SHALL propagate the top-level `correlation_id` (a UUID v4 generated at session start) in the A2A request's `metadata.correlation_id` field so that all A2A calls in a single orchestration run share a common trace root.

---

### Requirement 5: Shared Tools via AgentCore Gateway

**User Story:** As an AI engineer, I want all workers to access shared tools — web search, document retrieval, and a Python code sandbox — through a single AgentCore Gateway MCP endpoint so that tool credentials are centralised and not replicated across each worker's environment.

#### Acceptance Criteria

1. WHEN the Terraform stack is applied, THE SYSTEM SHALL provision an AgentCore Gateway named `orchestrator-gateway-{environment}` with a `STATIC` tool listing mode and at least three tool targets: a Brave Search Lambda Function URL (outbound auth: IAM SigV4), an S3 document-retrieval Lambda Function URL (outbound auth: IAM SigV4), and a code-sandbox Lambda Function URL (outbound auth: IAM SigV4); the Gateway SHALL NOT use `DYNAMIC` listing mode, as it is incompatible with semantic search and outbound 3-legged OAuth.
2. WHEN a worker's Strands Agents tool loop calls `x_amz_bedrock_agentcore_search` on the Gateway, THE SYSTEM SHALL return a ranked list of tool definitions matching the worker's intent description, enabling semantic discovery without the worker enumerating all available tools.
3. WHEN the Gateway routes an outbound call to a Lambda Function URL target, THE SYSTEM SHALL sign the request with IAM SigV4 using the Gateway's execution role; THE SYSTEM SHALL NOT configure SigV4 outbound auth for any ALB-fronted or direct EC2 target, as SigV4 is supported only for API Gateway and Lambda Function URLs.
4. WHEN a worker invokes a Gateway tool and the tool target returns an error, THE SYSTEM SHALL surface the error in the A2A response's `result.artifacts` list as an artifact of type `error`, preserving the tool name and upstream status code, so that the supervisor can decide whether to retry with a different tool.

---

### Requirement 6: Cross-Turn State with AgentCore Memory

**User Story:** As an AI engineer, I want the orchestrator to persist conversation context and intermediate results in AgentCore Memory so that multi-turn user interactions accumulate state without the supervisor re-sending full message histories on every turn.

#### Acceptance Criteria

1. WHEN the supervisor starts a new session, THE SYSTEM SHALL write a session-init record to AgentCore Memory under namespace `{MEMORY_NAMESPACE}/session/{session_id}` containing: `user_id`, `session_start_utc`, `model_id`, and the raw user request text, using the short-term memory event API.
2. WHEN the supervisor completes an orchestration run, THE SYSTEM SHALL write a long-term summary record under `{MEMORY_NAMESPACE}/user/{user_id}/summary` that distils the session's sub-tasks, worker assignments, and final answer into a compact JSON object, so that subsequent sessions can retrieve prior context via a Memory retrieval call.
3. WHEN a subsequent user turn arrives in an existing session, THE SYSTEM SHALL retrieve the most recent five long-term summary records for the `user_id` via the Memory retrieval API, prepend them as assistant-role context messages before the new user message, and limit retrieved records to those with `relevance_score >= 0.7`.
4. WHEN Memory write or retrieval calls fail with a transient error, THE SYSTEM SHALL log the failure with `severity = "WARN"`, continue the orchestration run without the persisted context, and emit a CloudWatch metric `OrchestratorMemoryError` with dimensions `{MemoryOperation, ErrorCode}`.

---

### Requirement 7: Hard Budget and Iteration Caps

**User Story:** As an AI engineer, I want hard ceilings on token spend and A2A delegation depth enforced by the supervisor so that runaway agent loops or unexpectedly expensive decompositions cannot exceed a configurable cost boundary.

#### Acceptance Criteria

1. WHEN the supervisor begins processing a user request, THE SYSTEM SHALL initialise a run-scoped counter `tokens_consumed = 0` and `iterations = 0`; after each LLM call or A2A dispatch, THE SYSTEM SHALL increment the counters by the tokens reported in the model response's `usage` field and by 1 respectively.
2. WHEN `tokens_consumed` exceeds the value of `MAX_TOKENS_PER_RUN` (default `50000`, configurable via environment variable), THE SYSTEM SHALL immediately halt further LLM calls and A2A dispatches, return a partial result to the caller indicating the budget was reached, and emit a CloudWatch metric `OrchestratorBudgetExceeded` with dimension `{RunId}`.
3. WHEN `iterations` exceeds the value of `MAX_ITERATIONS` (default `20`, configurable via environment variable), THE SYSTEM SHALL apply the same halt-and-partial-return behaviour as R7.2 and emit a CloudWatch metric `OrchestratorIterationCapHit`.
4. WHEN the supervisor detects that the same `(worker_id, task_description_hash)` pair has been dispatched more than twice within a single run, THE SYSTEM SHALL treat this as a loop, skip further dispatches to that worker for the remainder of the run, and log a `WARN`-level structured message containing `worker_id`, `task_description_hash`, and `iteration_count`.

---

### Requirement 8: Per-Agent Observability and Tracing

**User Story:** As an AI engineer, I want every agent — supervisor and each worker — to emit structured traces and metrics so that I can reconstruct the full delegation chain for any orchestration run and measure per-worker latency and error rates.

#### Acceptance Criteria

1. WHEN any agent (supervisor or worker) processes a request, THE SYSTEM SHALL emit an AWS X-Ray trace segment named `orchestrator.{agent_role}.{agent_id}` with subsegments for: routing-policy evaluation, each A2A call, each Memory read/write, and each Gateway tool invocation; the top-level `correlation_id` SHALL be added as an X-Ray annotation `correlation_id`.
2. WHEN the supervisor completes or aborts an orchestration run, THE SYSTEM SHALL emit a CloudWatch EMF (Embedded Metrics Format) log entry containing: `SessionId`, `UserId`, `TotalTokensConsumed`, `TotalIterations`, `WorkersInvoked` (count), `FailedSubtasks` (count), `DurationMs`, and `RunStatus` (`COMPLETED`, `BUDGET_EXCEEDED`, `ITERATION_CAP`, or `PARTIAL`).
3. WHEN a CloudWatch dashboard `OrchestratorDashboard-{environment}` is rendered, THE SYSTEM SHALL display: supervisor invocation count and p99 latency, per-worker A2A call count and error rate, Memory retrieval latency p50/p99, Gateway tool invocation count by tool name, and `OrchestratorBudgetExceeded` and `OrchestratorIterationCapHit` alarm counts over a 24-hour rolling window.
4. WHEN a worker's A2A error rate exceeds 20 % over any 5-minute window (measured as `FailedA2ACalls / TotalA2ACalls >= 0.20`), THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to the `orchestrator-ops-alerts-{environment}` SNS topic, which delivers an email notification to the on-call distribution list.

---

### Requirement 9: Deterministic Orchestration Evaluation

**User Story:** As an AI engineer, I want a repeatable evaluation harness that verifies the correct workers were invoked for a given input and that final answers meet quality thresholds, so that I can gate production deployments on measurable correctness.

#### Acceptance Criteria

1. WHEN the evaluation harness is run against a golden dataset of 50 labelled test inputs, THE SYSTEM SHALL replay each input against the deployed supervisor, capture the full delegation trace (which workers were called and in what order), and assert that the set of workers invoked matches the `expected_workers` list in the golden record with an exact-set F1 score of at least 0.90.
2. WHEN the Bedrock LLM-as-a-Judge evaluator is invoked on each final synthesised answer, THE SYSTEM SHALL assert that the average `helpfulness` score is at least `4.0 / 5.0` and the average `correctness` score is at least `3.5 / 5.0` across all 50 evaluation cases; any case with `harmfulness = true` SHALL be treated as an automatic failure regardless of other scores.
3. WHEN the evaluation harness completes a run, THE SYSTEM SHALL write the evaluation report to `eval/reports/{run_id}.json` containing: `run_id`, `timestamp`, `pass_rate`, `f1_score`, `avg_helpfulness`, `avg_correctness`, `harmful_count`, and a `cases` array with per-input breakdowns.
4. WHEN the evaluation pass rate falls below 85 %, THE SYSTEM SHALL exit with a non-zero exit code so that CI pipeline gates fail and prevent the Terraform stack from being promoted to the staging environment.

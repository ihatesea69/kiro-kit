# Requirements Document

## Introduction

This document defines the requirements for a **General-Purpose Customer Support Chatbot** built on Amazon Bedrock AgentCore. The chatbot is implemented as a **Strands Agents** agent, deployed on **AgentCore Runtime** as a containerised MCP server, and integrates with **AgentCore Memory** for per-session and long-term customer context, one **AgentCore Gateway** MCP tool target (a Lambda-backed order-lookup service), and **Amazon Bedrock Guardrails** for input and output safety filtering. Responses are streamed token-by-token to the calling client over the streamable-HTTP MCP transport.

The deliverables of this specification are **a production-ready chatbot system** — not a prototype. They include the Strands Agents Python implementation, the order-lookup Lambda, a Docker container image, a Terraform module set that provisions all AgentCore and supporting resources, streaming integration tests, and an LLM-as-a-Judge evaluation gate that must pass before any promotion to production.

## Glossary

| Term | Definition |
|------|-----------|
| AgentCore Runtime | The Amazon Bedrock AgentCore serverless service (GA October 2025) that hosts containerised AI agents; containers must expose an MCP endpoint at `0.0.0.0:8000/mcp` using the streamable-HTTP transport. |
| AgentCore Gateway | The AgentCore component that converts Lambda functions, REST APIs, and existing MCP servers into MCP tool targets accessible to agents; supports semantic tool discovery via `x_amz_bedrock_agentcore_search`. |
| AgentCore Memory | The AgentCore component that provides short-term session event storage and long-term persistent record storage for agent context; distinct pricing tiers for event ingestion, record storage, and retrieval. |
| Strands Agents | AWS's lightweight code-first agent SDK; uses a model-driven tool loop, treats Bedrock as its default model provider, and supports observability hooks and multi-agent orchestration. |
| MCP (Model Context Protocol) | An open protocol for exposing tools and context sources to AI agents; AgentCore uses the streamable-HTTP transport variant where the server streams responses as chunked HTTP. |
| Streamable-HTTP | The MCP transport variant in which the server listens on a plain HTTP endpoint (`/mcp`) and sends incremental chunks for streaming tool responses; started with `mcp.run(transport="streamable-http")`. |
| Bedrock Guardrails | An Amazon Bedrock feature (GA) that applies content filtering, topic denial, PII redaction, and grounding checks to model inputs and outputs; configured independently of the model and applied via the `guardrailConfig` parameter on inference calls. |
| Order-Lookup Tool | A Lambda function exposed via AgentCore Gateway as an MCP tool; accepts `order_id` or `customer_id` and returns current order status, shipment tracking, and estimated delivery date from the Order Management Service. |
| Session Context | Per-conversation memory events stored in AgentCore Memory's short-term store; scoped to a `session_id` and used to maintain conversation continuity within a single support interaction. |
| Long-Term Memory | Customer-level persistent records stored in AgentCore Memory's long-term store; includes previously resolved issues, stated preferences, and contact history, retrieved at session start to personalise responses. |
| MCP Tool Target | A Gateway-registered endpoint (Lambda Function URL with IAM auth) that the Gateway exposes as an MCP tool; the Gateway handles protocol translation and outbound IAM SigV4 signing on behalf of the agent. |
| LLM-as-a-Judge | An evaluation pattern (Bedrock RAG evaluation GA 20 March 2025) in which a separate model invocation scores agent responses for correctness, helpfulness, faithfulness, harmfulness, and answer refusal quality against a golden dataset. |
| Guardrail Trace | A structured log entry emitted by Bedrock Guardrails recording which policy was triggered (topic denial, content filter, PII redaction), the policy name, the confidence score, and the action taken (BLOCKED or ANONYMIZED). |

## Out of Scope

- Human-agent escalation and live-agent handoff; the chatbot operates autonomously and cannot transfer a conversation to a human operator.
- Order modification, cancellation, or payment processing; the order-lookup tool is strictly read-only.
- Multi-language support; the initial release handles English only. Locale detection and translation are deferred to a future specification.
- Voice and telephony channel integration (e.g., Amazon Connect, Twilio); the specification covers the HTTP/MCP interface only.
- Fine-tuning or custom model training; the agent uses a foundation model from the Bedrock model catalogue without adaptation.
- Multi-region active-active deployment; the architecture targets a single AWS region with per-AZ redundancy provided by AgentCore Runtime's managed scaling.
- End-user authentication and authorisation; the calling application (web or mobile front end) is responsible for authenticating users and passing a verified `customer_id` in the session context.

## Requirements

### Requirement 1: Strands Agents Chatbot with Intent Handling

**User Story:** As a customer using the support portal, I want to describe my issue in natural language and receive an accurate, contextualised response — including real-time order data when relevant — so that I can resolve my query without calling a human agent.

#### Acceptance Criteria

1. WHEN a customer submits a support message, THE SYSTEM SHALL invoke the Strands Agents agent with the customer's message, the current `session_id`, and a system prompt that defines the agent's persona, lists available tools, and instructs the agent to escalate (respond with a structured `cannot_help` signal) when the query falls outside the defined support scope.
2. WHEN the agent determines that order information is needed to answer the query, THE SYSTEM SHALL invoke the `order_lookup` MCP tool via AgentCore Gateway at most twice per turn (to prevent runaway tool loops), passing exactly the fields `order_id` or `customer_id` as extracted from the conversation context, and incorporate the tool's response into the final answer.
3. WHEN the agent has produced a complete response, THE SYSTEM SHALL return the response as a stream of text chunks over the MCP streamable-HTTP connection, with the first chunk delivered within 3 seconds of the request being received under p95 conditions.
4. WHEN the agent cannot determine a confident answer after tool use, THE SYSTEM SHALL respond with a structured fallback message that acknowledges the limitation, avoids hallucinating order details, and suggests the customer contact support via email, rather than generating plausible-sounding but unverified information.

---

### Requirement 2: AgentCore Runtime Container Deployment

**User Story:** As a platform engineer, I want the chatbot agent packaged as a container and deployed on AgentCore Runtime so that the service scales automatically with traffic, requires no server management, and can be updated by pushing a new container image.

#### Acceptance Criteria

1. WHEN the container image is built, THE SYSTEM SHALL start an MCP server at `0.0.0.0:8000/mcp` using `mcp.run(transport="streamable-http")`, with the Strands Agents agent initialised at startup and reused across requests within a container instance to amortise model-client warmup cost.
2. WHEN the AgentCore Runtime agent resource is provisioned, THE SYSTEM SHALL reference the container image from an Amazon ECR private repository (`support-chatbot-agent`) in the same AWS account and region, and configure the execution role with permissions for `bedrock:InvokeModelWithResponseStream`, `bedrock:ApplyGuardrail`, `bedrock-agentcore:RetrieveMemory`, `bedrock-agentcore:PutMemoryEvents`, and `bedrock-agentcore:InvokeGatewayTool`.
3. WHEN the Runtime receives an `InvokeAgentRuntime` API call, THE SYSTEM SHALL forward the request to the container's `/mcp` endpoint using the streamable-HTTP protocol and relay the streamed response chunks back to the caller without buffering.
4. WHEN a new container image is pushed to ECR with the `production` tag, THE SYSTEM SHALL allow a zero-downtime rolling update to the Runtime agent resource without requiring manual redeployment; the Terraform resource must reference the image tag (not a digest) to enable tag-driven updates.

---

### Requirement 3: AgentCore Memory — Session and Long-Term Context

**User Story:** As a customer, I want the chatbot to remember what I said earlier in the conversation and to know my previous support history, so that I do not have to repeat information I have already provided.

#### Acceptance Criteria

1. WHEN a new support session starts, THE SYSTEM SHALL call `AgentCoreMemory:RetrieveMemoryRecords` with the customer's `customer_id` as the namespace key to retrieve up to 10 long-term memory records (previously resolved issues, stated preferences), and inject the retrieved summaries into the agent's system-prompt context block before the first model invocation.
2. WHEN the agent produces a response turn, THE SYSTEM SHALL call `AgentCoreMemory:PutMemoryEvents` with `memoryId`, `sessionId`, and an event payload containing `role` (`USER` or `ASSISTANT`), `content` (the turn text), and `timestamp` (ISO 8601 UTC), so that the session event log is durable even if the container instance is replaced mid-session.
3. WHEN a support session is marked resolved (via the `resolve_session` tool or by the caller setting `session_state = CLOSED`), THE SYSTEM SHALL call `AgentCoreMemory:ConsolidateMemory` to distil the session events into a long-term record stored under the customer's namespace, retaining: issue category, resolution summary, and any customer preferences expressed during the session.
4. WHEN the `RetrieveMemoryRecords` call returns no records for a `customer_id`, THE SYSTEM SHALL proceed without error, using only the current session events as context, and include a welcoming first-contact greeting variant in the agent's response.

---

### Requirement 4: AgentCore Gateway and Order-Lookup MCP Tool

**User Story:** As a platform engineer, I want the order-lookup Lambda to be exposed as an MCP tool via AgentCore Gateway so that the agent can retrieve live order data without embedding Lambda invocation logic in the agent code and without hardcoding the Lambda ARN in the container.

#### Acceptance Criteria

1. WHEN the AgentCore Gateway resource is provisioned, THE SYSTEM SHALL register one MCP tool target pointing to the order-lookup Lambda Function URL, using `STATIC` listing mode (not `DYNAMIC`, to preserve compatibility with semantic tool discovery), outbound auth type `IAM_SIGV4`, and a tool schema defining the `order_lookup` tool with input properties `order_id` (string, optional) and `customer_id` (string, optional) with a constraint that at least one must be present.
2. WHEN the agent's MCP client calls the `order_lookup` tool, THE SYSTEM SHALL route the call through the Gateway, which signs the request with IAM SigV4 using the Gateway's execution role, invokes the order-lookup Lambda Function URL, and returns the JSON response body as the MCP tool result within 5 seconds.
3. WHEN the order-lookup Lambda returns a non-2xx HTTP status or times out, THE SYSTEM SHALL have the Gateway return a structured MCP tool error (not an unhandled exception) with an `error_code` field set to `UPSTREAM_ERROR` and a `message` field describing the failure, so the agent can incorporate the error into its response gracefully.
4. WHEN `AgentCoreGateway:SearchTools` is called with a natural-language query (using the built-in `x_amz_bedrock_agentcore_search` capability), THE SYSTEM SHALL return the `order_lookup` tool in the result set when the query contains terms related to orders, shipments, tracking, or delivery status.

---

### Requirement 5: Bedrock Guardrails Content Safety

**User Story:** As a trust and safety engineer, I want all customer inputs and agent outputs to be screened by Bedrock Guardrails so that the chatbot cannot be manipulated into producing harmful content, leaking PII, or discussing off-topic subjects.

#### Acceptance Criteria

1. WHEN the agent invokes the Bedrock model, THE SYSTEM SHALL include a `guardrailConfig` object in every `InvokeModelWithResponseStream` call specifying `guardrailIdentifier` (the Guardrail ARN from `GUARDRAIL_ARN` env var), `guardrailVersion` (`"1"`), and `trace` (`"enabled"`), so that both the input prompt and the streamed output are evaluated against the Guardrail policy.
2. WHEN the Guardrail detects a denied topic (policy: `off-topic-support`) in the customer's input, THE SYSTEM SHALL block the request and return a canned refusal message (`GUARDRAIL_INTERVENED` action code) without invoking the model, and emit a `GuardrailIntervention` CloudWatch metric with dimension `PolicyName = off-topic-support`.
3. WHEN the Guardrail detects PII (email address, phone number, credit card number) in the agent's output, THE SYSTEM SHALL anonymise the detected PII using the `ANONYMIZE` action (replacing the value with a type placeholder such as `[EMAIL]`), and record the anonymisation event in the Guardrail trace log entry emitted to CloudWatch Logs.
4. WHEN a Guardrail trace log entry is emitted, THE SYSTEM SHALL write it to the CloudWatch log group `/bedrock/guardrails/support-chatbot` in JSON format containing: `session_id`, `turn_id`, `action` (NONE / BLOCKED / ANONYMIZED), `policies_triggered` (array), and `latency_ms`.

---

### Requirement 6: Streaming Response Delivery

**User Story:** As a customer, I want to see the chatbot's response appear word-by-word as it is generated, rather than waiting for the full response to be ready, so that the interaction feels responsive even for longer answers.

#### Acceptance Criteria

1. WHEN the Strands Agents agent produces a streaming model response, THE SYSTEM SHALL forward each text delta chunk to the MCP client as an incremental MCP `content_block_delta` event over the streamable-HTTP connection, flushing each chunk to the network without waiting for the full response to complete.
2. WHEN the streaming response is complete, THE SYSTEM SHALL send a `content_block_stop` MCP event followed by a `message_stop` event carrying a `stop_reason` field (`"end_turn"` or `"tool_use"`) and a `usage` field with `input_tokens` and `output_tokens` counts for the turn.
3. WHEN a tool call interrupts the streaming response (the model emits a `tool_use` block mid-stream), THE SYSTEM SHALL pause the stream, execute the tool call synchronously, and resume streaming the model's continuation without closing the underlying HTTP connection, so the client observes a single uninterrupted stream for the full turn.
4. WHEN the client disconnects before the stream completes, THE SYSTEM SHALL detect the broken connection (via an `asyncio.CancelledError` or a write-to-closed-socket error), cancel the in-progress model invocation to avoid unnecessary Bedrock token consumption, and log a `StreamAborted` event to CloudWatch with `session_id` and `tokens_consumed_before_abort`.

---

### Requirement 7: Terraform Infrastructure-as-Code

**User Story:** As a platform engineer, I want every AgentCore resource, Lambda function, IAM role, and Guardrail defined in Terraform modules so that environments are reproducible, drift is detected in CI, and no manual console changes are needed.

#### Acceptance Criteria

1. WHEN a Terraform plan is executed against any environment workspace, THE SYSTEM SHALL produce a plan with no manual resource imports required, covering the full module set: `modules/guardrails` (Bedrock Guardrail), `modules/memory` (AgentCore Memory), `modules/gateway` (AgentCore Gateway + order-lookup tool target), `modules/order_lookup` (Lambda + Function URL), and `modules/runtime` (AgentCore Runtime agent resource + ECR repository).
2. WHEN `terraform validate` and `tflint --module` are run on the module set, THE SYSTEM SHALL produce zero errors and zero warnings, using `tflint-ruleset-aws` version `>=0.31` with rules for deprecated resource arguments, missing required tags, and Lambda runtime version checks.
3. WHEN `checkov --directory infra/terraform/` is run, THE SYSTEM SHALL pass all `HIGH` and `CRITICAL` severity checks including: Lambda not publicly exposed (`CKV_AWS_45`), ECR image scanning enabled (`CKV_AWS_163`), CloudWatch log group encrypted (`CKV_AWS_158`), and Lambda environment variables not containing plaintext secrets (`CKV_AWS_45`).
4. WHEN any Terraform module is applied, THE SYSTEM SHALL tag every provisioned resource with at minimum: `Environment`, `Project`, `ManagedBy = "terraform"`, and `Owner` — enforced via a `default_tags` block in the `aws` provider.

---

### Requirement 8: LLM-as-a-Judge Evaluation Gate

**User Story:** As an ML engineer, I want an automated evaluation suite that scores the chatbot on correctness, helpfulness, and safety using LLM-as-a-Judge before any production promotion, so that regressions in response quality are caught before they affect customers.

#### Acceptance Criteria

1. WHEN the evaluation suite is executed against a deployed sandbox environment, THE SYSTEM SHALL run a golden dataset of 50 test cases (25 order-status queries with known ground-truth answers, 15 out-of-scope queries that should trigger refusal, and 10 adversarial jailbreak attempts that must be blocked by Guardrails) by invoking the sandbox Runtime endpoint and collecting full response texts.
2. WHEN evaluating order-status responses, THE SYSTEM SHALL use the Bedrock `InvokeModel` API with `amazon.titan-text-premier-v1:0` as the judge model and compute: `correctness` (does the response match the ground-truth order status?), `faithfulness` (are all claims grounded in the tool response?), and `helpfulness` (does the response address the customer's question?) — all scored 1–5 per the Bedrock RAG evaluation metric definitions (GA 20 March 2025).
3. WHEN evaluating safety responses, THE SYSTEM SHALL assert that all 15 out-of-scope queries receive a refusal (no factual claim made outside the support domain) and all 10 adversarial inputs are blocked at the Guardrail layer (`action = BLOCKED` in the Guardrail trace), using exact match on the `GuardrailIntervention` metric count.
4. WHEN the evaluation suite completes, THE SYSTEM SHALL fail the CI pipeline (exit code 1) if the mean `correctness` score across order-status cases is below 4.0, or if fewer than 14 of the 15 out-of-scope queries yield a refusal, or if any adversarial input is not blocked, and SHALL publish a JSON evaluation report to `s3://support-chatbot-eval-{env}/reports/{run_id}/eval-report.json`.

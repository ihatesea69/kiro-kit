# Requirements Document

## Introduction

This document defines the requirements for an **OAuth-protected remote MCP server on AWS Lambda, registered as an Amazon Bedrock AgentCore Gateway target**. The server is implemented in Python using the MCP SDK with streamable-HTTP transport, packaged as a Lambda container image, and exposed through a **Lambda Function URL**. OAuth 2.0 protection is provided by **Amazon Cognito** acting as the authorisation server; the RFC 7235 `WWW-Authenticate` response header advertises the authorisation server endpoint to callers that present no Bearer token, completing the RFC 6749 / RFC 7235 handshake. The server is then registered as an MCP-server target in **Amazon Bedrock AgentCore Gateway** (GA October 2025) using **2LO (client credentials)** outbound authentication, giving agents a unified tool surface with built-in semantic discovery.

The deliverables of this specification are **both implementation artifacts and infrastructure**: a Python Lambda container, Terraform IaC modules covering ECR, Cognito, Lambda, and AgentCore Gateway, an MCP Inspector-based local test loop via Docker Compose, and an integration test suite executed against the deployed sandbox environment.

## Glossary

| Term | Definition |
|------|-----------|
| MCP | Model Context Protocol — an open standard for exposing tools and resources to AI agents over HTTP. |
| Remote MCP Server | An MCP server hosted at a durable HTTPS endpoint (here, a Lambda Function URL) rather than running as a local sidecar process. |
| Streamable-HTTP Transport | The MCP transport mode (`transport="streamable-http"`) that encodes tool calls and responses over standard HTTP POST requests with optional server-sent-event streaming; the client uses `streamablehttp_client`. |
| Lambda Function URL | A dedicated HTTPS endpoint attached directly to a Lambda function, bypassing API Gateway; supports `AWS_IAM` SigV4 or `NONE` (application-layer auth) as the authorisation type. |
| Lambda Container Image | A Lambda deployment package built as an OCI image and stored in Amazon ECR; used here to bundle the Python MCP server and its dependencies without size constraints of a ZIP archive. |
| AgentCore Gateway | The Bedrock AgentCore component that converts APIs, Lambda functions, and existing MCP servers into a unified, agent-consumable tool surface; GA October 2025 across nine regions. |
| MCP-Server Target | A Gateway target type representing a pre-existing, externally hosted MCP server that the Gateway proxies rather than wraps; supports outbound auth modes: none, OAuth (2LO + 3LO), IAM SigV4, and API key. |
| 2LO (Two-Legged OAuth) | OAuth 2.0 client credentials flow (RFC 6749 §4.4) where a client authenticates directly with the authorisation server using a `client_id` and `client_secret`, receiving an access token without end-user involvement. |
| Bearer Token | An OAuth 2.0 access token transmitted in the `Authorization: Bearer <token>` HTTP request header (RFC 6750); required on every request to the protected Lambda Function URL. |
| WWW-Authenticate | HTTP response header (RFC 7235 §4.1) returned alongside HTTP 401; used here to advertise the Cognito token endpoint so unauthenticated clients know where to obtain a Bearer token. |
| Cognito M2M Client | An Amazon Cognito app client with only the `client_credentials` grant type enabled; issues access tokens scoped to the custom resource server without any user pool sign-in flow. |
| STATIC listing mode | AgentCore Gateway tool listing mode where the tool manifest is fetched once at target registration time and cached in the tool index; **required** for semantic search and outbound 2LO to function. |
| DYNAMIC listing mode | AgentCore Gateway tool listing mode where tools are re-fetched at each invocation; **incompatible with semantic search (`x_amz_bedrock_agentcore_search`) and outbound 3LO** — must not be used in this deployment. |
| Semantic Tool Discovery | The Gateway built-in capability `x_amz_bedrock_agentcore_search` that accepts a natural-language query and returns the most relevant tools from the index, solving tool-overload at thousands-of-tools scale. |
| MCP Inspector | The official MCP debugging UI (`@modelcontextprotocol/inspector`) used to inspect tool listings and invoke tools interactively against a running server during local development. |

## Out of Scope

- **AgentCore Runtime** as an alternative hosting target; the trade-off between Runtime and Lambda + Function URL is discussed in the design, but the implementation targets Lambda only.
- **3LO (authorisation code flow)** for per-end-user tokens and explicit consent; this GA'd for MCP-server Gateway targets in April 2026 and is not covered here.
- Custom OAuth providers (Okta, Auth0, custom IdPs) beyond Amazon Cognito; the design notes where a custom provider would plug in.
- Business logic inside individual MCP tools; the two example tools return deterministic stub data and are illustrative only.
- Multi-region active-active deployment; the architecture targets a single AWS region with Lambda's per-AZ redundancy.
- Schema versioning for MCP tool contracts across backward-incompatible tool changes.
- Cost optimisation tuning (Lambda memory and reserved concurrency sizing) beyond the defaults specified in the Terraform module.

## Requirements

### Requirement 1: Lambda Container Image and Function URL

**User Story:** As an AI engineer, I want the MCP server packaged as a Lambda container image exposed through a Lambda Function URL, so that agents can reach the server over a stable HTTPS endpoint without operating a long-running container cluster or API Gateway.

#### Acceptance Criteria

1. WHEN the CI pipeline builds the Lambda image, THE SYSTEM SHALL produce an OCI image based on `public.ecr.aws/lambda/python:3.12`, install `mcp[cli]>=1.3`, `python-jose[cryptography]`, `httpx`, and `mangum`, copy the `src/` module, and push the resulting image to the ECR repository `mcp-server-agentcore` with the tag `${GIT_SHA}` and an immutable tag policy.
2. WHEN the Terraform `lambda` module is applied, THE SYSTEM SHALL create a Lambda function `mcp-server-agentcore-${var.environment}` with `package_type = "Image"`, `image_uri` referencing the ECR image digest pinned in `var.image_uri`, `timeout = 30`, `memory_size = 512`, and environment variables `COGNITO_ISSUER_URL`, `COGNITO_AUDIENCE`, `COGNITO_REQUIRED_SCOPE`, and `LOG_LEVEL = "INFO"`.
3. WHEN the Lambda Function URL is provisioned, THE SYSTEM SHALL set `authorization_type = "NONE"` so that the function handles Bearer-token validation at the application layer, and configure CORS to allow `POST` and `GET` from `*` origins with `max_age = 300`.
4. WHEN the Lambda function cold-starts, THE SYSTEM SHALL complete initialisation — `mcp` module import and Cognito JWKS pre-fetch — within 5 seconds, as measured by the Lambda `Init Duration` CloudWatch metric emitted to the `MCPServer/${var.environment}` namespace.

---

### Requirement 2: OAuth 2.0 Protection and RFC 7235 Handshake

**User Story:** As an AI engineer, I want every request to the MCP server validated against a Cognito-issued Bearer token, so that only registered Gateway clients can invoke tools and unauthenticated callers receive a standards-compliant 401 response that tells them exactly where to obtain a token.

#### Acceptance Criteria

1. WHEN a request arrives at the Lambda Function URL without an `Authorization` header or with a scheme other than `Bearer`, THE SYSTEM SHALL return HTTP 401 with the response header `WWW-Authenticate: Bearer realm="mcp-server-agentcore", authorization_uri="https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/openid-configuration"` and a JSON body `{"error": "missing_token", "message": "Bearer token required"}`.
2. WHEN a request arrives with `Authorization: Bearer <token>` and the token fails Cognito JWKS validation (expired, wrong issuer, wrong audience, or invalid signature), THE SYSTEM SHALL return HTTP 401 with `WWW-Authenticate: Bearer error="invalid_token"` and a JSON body `{"error": "invalid_token", "message": "<reason>"}`, with no internal stack trace in the response body.
3. WHEN a valid Bearer token is presented and its `scope` claim includes `mcp-server/tools:read`, THE SYSTEM SHALL forward the request to the MCP server handler and return the MCP-protocol response with HTTP 200.
4. WHEN the Cognito User Pool is provisioned, THE SYSTEM SHALL create a resource server with identifier `mcp-server` and a custom scope `mcp-server/tools:read`; the M2M app client SHALL have only the `client_credentials` grant type enabled and issue tokens scoped to `mcp-server/tools:read` with a token expiry of 3600 seconds.
5. WHEN the Lambda function validates a Bearer token, THE SYSTEM SHALL cache the Cognito JWKS response for 300 seconds in an in-memory dict keyed on the `kid` header claim, so that a JWKS HTTP fetch is not required on every warm invocation.

---

### Requirement 3: MCP Server Implementation — Streamable-HTTP Transport

**User Story:** As an AI engineer, I want the MCP server implemented with the Python MCP SDK using streamable-HTTP transport, so that any MCP-compatible client (including AgentCore Gateway) can discover and invoke tools using the standard MCP protocol without bespoke integration code.

#### Acceptance Criteria

1. WHEN the Lambda handler is invoked, THE SYSTEM SHALL initialise a `FastMCP` server instance named `"agentcore-demo"`, serve the MCP protocol via `mcp.run(transport="streamable-http")` wrapped in a `Mangum` adapter, and mount the auth middleware as a Starlette middleware layer that intercepts all requests before MCP routing.
2. WHEN a client sends an MCP `tools/list` request to the server, THE SYSTEM SHALL return a JSON response containing all registered tools with their `name`, `description`, and `inputSchema` fields populated according to JSON Schema draft 2020-12, within 2 seconds on a warm Lambda invocation.
3. WHEN a client sends an MCP `tools/call` request for a registered tool, THE SYSTEM SHALL execute the tool handler, return the result in the MCP `content` array with `type = "text"` or `type = "json"`, and complete the response within the Lambda timeout of 30 seconds.
4. WHEN the MCP server encounters an unhandled exception inside a tool handler, THE SYSTEM SHALL catch the exception, emit a structured CloudWatch Logs entry with `log_level = "ERROR"`, `tool_name`, and `error_type`, and return an MCP error response with `isError = true` and a sanitised user-facing message.

---

### Requirement 4: MCP Tool Contracts — Example Tool Set

**User Story:** As an AI engineer, I want the server to ship with at least two illustrative MCP tools with typed input schemas and human-readable descriptions, so that Gateway registration, semantic discovery, and the MCP Inspector test loop can all be validated against real, deterministic tool definitions.

#### Acceptance Criteria

1. WHEN the tool `get_account_summary` is called with a valid `account_id` string matching the pattern `^ACC-[0-9]{6}$`, THE SYSTEM SHALL return a JSON object containing `account_id` (string), `balance_usd` (number), `currency` (string), and `last_updated_at` (ISO 8601 UTC string); WHEN `account_id` does not match the pattern, THE SYSTEM SHALL return an MCP error response with `isError = true` and message `"invalid account_id format; expected ACC-NNNNNN"`.
2. WHEN the tool `list_recent_transactions` is called with `account_id` (string) and optional `limit` (integer, default 10), THE SYSTEM SHALL return a JSON array of transaction objects each containing `transaction_id` (string), `amount_usd` (number), `direction` (`"debit"` or `"credit"`), `description` (string), and `posted_at` (ISO 8601 UTC string); WHEN `limit` is outside the range 1–50, THE SYSTEM SHALL clamp it to the nearest bound and include a `"warning"` field in the response object noting the adjustment.
3. WHEN `TEST_MODE=true` is set in the Lambda environment, THE SYSTEM SHALL return deterministic stub responses from both tools — `get_account_summary` returns a fixed balance of `1234.56 USD` for any valid `account_id`, and `list_recent_transactions` returns exactly 3 stub transaction objects — so that the MCP Inspector test loop and integration tests require no live backend dependency.

---

### Requirement 5: AgentCore Gateway Registration

**User Story:** As an AI engineer, I want the Lambda MCP server registered as an MCP-server target in AgentCore Gateway with 2LO outbound authentication, so that agents querying the Gateway can invoke the server's tools without managing Cognito credentials themselves.

#### Acceptance Criteria

1. WHEN the Terraform `gateway` module applies, THE SYSTEM SHALL provision an AgentCore Gateway resource named `mcp-gateway-${var.environment}`, an MCP-server target pointing to the Lambda Function URL, `listing_mode = "STATIC"`, and outbound authentication configured as `oauth_2_0` with `grant_type = "client_credentials"`, Cognito token URL `https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/oauth2/token`, and the M2M client ID and secret read from an AWS Secrets Manager secret at ARN `arn:aws:secretsmanager:{region}:{account_id}:secret:mcp-gateway/cognito-m2m-${var.environment}`.
2. WHEN the Gateway target is registered with `listing_mode = "STATIC"`, THE SYSTEM SHALL fetch the tool manifest from the MCP server at registration time, cache it in the Gateway tool index, and make both `get_account_summary` and `list_recent_transactions` available within 60 seconds of the Terraform apply completing.
3. WHEN the Terraform variable `gateway_listing_mode` is set to `"DYNAMIC"`, THE SYSTEM SHALL reject the configuration with a Terraform `validation` block error reading `"DYNAMIC listing mode disables semantic search and outbound 3LO; use STATIC"`, preventing deployment of an incompatible configuration.
4. WHEN the Gateway target registration call to the Bedrock AgentCore API fails (for example, the Lambda Function URL is unreachable or the M2M credentials are rejected), THE SYSTEM SHALL surface the API error message in Terraform output as a non-zero exit code, and no partial Gateway target resource SHALL remain in an inconsistent state.

---

### Requirement 6: Semantic Tool Discovery

**User Story:** As an AI engineer, I want the Gateway to support natural-language tool lookup via the built-in `x_amz_bedrock_agentcore_search` tool, so that agents with access to hundreds or thousands of tools can locate the right tool without exhaustive enumeration of the full tool list.

#### Acceptance Criteria

1. WHEN an agent invokes `x_amz_bedrock_agentcore_search` with a natural-language query such as `"show me recent transactions for an account"`, THE SYSTEM SHALL return a ranked list of matching tool names and descriptions from the Gateway's cached tool index without invoking the Lambda MCP server.
2. WHEN the Gateway tool index is populated at target registration time, THE SYSTEM SHALL index `get_account_summary` and `list_recent_transactions` including their `description` fields; both tools SHALL be returned as top-2 results when queried with the phrase `"account balance or transactions"`.
3. WHEN a Gateway tool index refresh is triggered by re-running `terraform apply` to force target re-registration, THE SYSTEM SHALL rebuild the index from the fresh `STATIC` tool manifest within 60 seconds and make updated tool descriptions available to subsequent `x_amz_bedrock_agentcore_search` queries.

---

### Requirement 7: Terraform Infrastructure as Code

**User Story:** As an AI engineer, I want the entire infrastructure — ECR repository, Cognito User Pool, Lambda function, and AgentCore Gateway — defined in Terraform modules, so that the same configuration deploys consistently to sandbox and production with no manual console steps.

#### Acceptance Criteria

1. WHEN `terraform plan` is executed against any environment workspace, THE SYSTEM SHALL produce a plan with no manual resource imports required, covering four modules: `modules/ecr` (ECR repository + lifecycle policy + image scan on push), `modules/cognito` (User Pool, resource server, M2M app client, Secrets Manager secret for M2M credentials), `modules/lambda` (Lambda function + Function URL + IAM execution role + CloudWatch log group), and `modules/gateway` (AgentCore Gateway + MCP-server target).
2. WHEN `terraform validate` and `tflint --module` are run on the full module set, THE SYSTEM SHALL produce zero errors and zero warnings, using `tflint-ruleset-aws >= 0.27` with rules for deprecated resource arguments and missing required tags.
3. WHEN `checkov --directory infra/terraform/` is run, THE SYSTEM SHALL pass all `HIGH` and `CRITICAL` severity checks including: ECR image scan on push (`CKV_AWS_163`), Secrets Manager rotation enabled (`CKV_AWS_149`), Lambda not publicly accessible via resource policy (`CKV_AWS_45`), and CloudWatch log group encrypted (`CKV_AWS_158`).
4. WHEN any Terraform module is applied, THE SYSTEM SHALL tag every provisioned resource with at minimum `Environment`, `Project`, `ManagedBy = "terraform"`, and `Owner`, enforced via a `default_tags` block in the `aws` provider configuration and validated by a `checkov` custom policy.

---

### Requirement 8: MCP Inspector Local Test Loop

**User Story:** As an AI engineer, I want a repeatable local test loop using MCP Inspector that exercises tool listing and invocation without deploying to AWS, so that I can validate tool schemas and handler logic during development with fast iteration cycles.

#### Acceptance Criteria

1. WHEN `docker compose up` is run from the repository root, THE SYSTEM SHALL start the MCP server container with `TEST_MODE=true` on `http://localhost:8000/mcp` and the MCP Inspector UI on `http://localhost:5173`, reachable without any AWS credentials or live Cognito instance.
2. WHEN the MCP Inspector connects to `http://localhost:8000/mcp`, THE SYSTEM SHALL list at least the two tools defined in Requirement 4 — `get_account_summary` and `list_recent_transactions` — with their full `inputSchema` populated, within 3 seconds of connection.
3. WHEN a tool call for `get_account_summary` with `account_id = "ACC-000001"` is submitted via the MCP Inspector UI in `TEST_MODE`, THE SYSTEM SHALL return the deterministic stub response within 2 seconds and display the result in the Inspector result panel without error.
4. WHEN `docker compose down` is run, THE SYSTEM SHALL cleanly stop all containers with exit code 0 and leave no orphaned Docker volumes or networks.

---

### Requirement 9: Observability — Structured Logging, Metrics, and Tracing

**User Story:** As an AI engineer, I want structured CloudWatch Logs, custom metrics, and X-Ray traces covering the MCP server's OAuth validation and tool invocation paths, so that I can diagnose token validation failures, tool errors, and latency regressions in production without correlating unstructured log lines.

#### Acceptance Criteria

1. WHEN the MCP server processes any request, THE SYSTEM SHALL emit a structured JSON log entry to the CloudWatch log group `/aws/lambda/mcp-server-agentcore-${var.environment}` containing `request_id` (Lambda request ID), `tool_name` (string or `null` for non-tool requests), `auth_result` (`"ok"` or `"rejected"`), `duration_ms` (integer), and `log_level`.
2. WHEN the Lambda function processes a tool call, THE SYSTEM SHALL emit an X-Ray trace segment with subsegments for `auth_validation` (JWKS cache hit or miss, and JWT decode duration), `tool_dispatch` (tool handler execution), and any downstream HTTP calls; the `tool_name` SHALL be recorded as an X-Ray annotation using `xray.put_annotation("tool_name", name)`.
3. WHEN an OAuth validation failure occurs, THE SYSTEM SHALL increment the custom CloudWatch metric `MCPServer/AuthFailures` in the namespace `MCPServer/${var.environment}` with dimension `FailureType` set to `"missing_token"` or `"invalid_token"` as appropriate.
4. WHEN the CloudWatch dashboard `MCPServerDashboard-${var.environment}` is rendered, THE SYSTEM SHALL display: Lambda invocation count and p99 latency, Lambda error rate, `MCPServer/AuthFailures` count by `FailureType`, X-Ray service map for the Lambda function, and Lambda `Init Duration` as a cold-start monitor widget.

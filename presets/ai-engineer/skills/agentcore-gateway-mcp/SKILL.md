---
name: agentcore-gateway-mcp
description: >-
  Turn Lambda functions, OpenAPI and Smithy APIs, and existing MCP servers into
  a unified MCP tool surface with Amazon Bedrock AgentCore Gateway. Use when
  giving an agent tools, configuring inbound or outbound Gateway auth, or
  enabling semantic tool discovery at scale.
---

# AgentCore Gateway (MCP)

Activate this skill when an agent needs tools and you do not want to hand-roll an
MCP server per integration.

## When to Use

- Exposing existing Lambda functions or REST APIs to an agent as MCP tools
- Fronting an MCP server you already run
- Choosing inbound (agent → Gateway) or outbound (Gateway → target) auth
- Scaling past a few dozen tools without blowing up the context window

## What It Does

Gateway converts **APIs, Lambda functions, and existing services into
MCP-compatible tools**, and connects to **pre-existing MCP servers**, exposing
all of them to agents through Gateway endpoints. The result is one tool surface
unifying MCP servers, knowledge bases, internal APIs, and Lambda functions.

**Pricing**: $0.005 per 1,000 API invocations, plus $0.02 per 100 tools indexed
per month.

## Target Types

| Target | Source of truth | Good for |
|--------|-----------------|----------|
| Lambda | Function ARN + a tool schema you supply | Bespoke logic, private data access |
| OpenAPI | An OpenAPI 3 document | Existing REST services |
| Smithy | A Smithy model | AWS-service-shaped APIs |
| MCP server | A remote MCP endpoint | Servers you or a vendor already run |

Lambda target sketch:

```python
import boto3
agentcore = boto3.client("bedrock-agentcore-control")

agentcore.create_gateway_target(
    gatewayIdentifier=gateway_id,
    name="order-lookup",
    targetConfiguration={"mcp": {"lambda": {
        "lambdaArn": "arn:aws:lambda:us-east-1:123456789012:function:order-lookup",
        "toolSchema": {"inlinePayload": [{
            "name": "lookup_order",
            "description": (
                "Return status, items, and delivery estimate for a customer order. "
                "Do not use for refunds or cancellations — see process_refund."
            ),
            "inputSchema": {"type": "object",
                            "properties": {"order_id": {"type": "string"}},
                            "required": ["order_id"]},
        }]},
    }}},
    credentialProviderConfigurations=[{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
)
```

Note the description: it states what the tool does *and when not to use it*.
Descriptions are read by a retriever and by a model, not by a human browsing docs.

## Inbound Auth (agent → Gateway)

OAuth per the MCP spec, with native integration for **Amazon Cognito, Okta, and
Auth0**, plus custom providers. Both flows are supported:

- **3LO** (authorization code) — the agent acts on behalf of an end user.
- **2LO** (client credentials) — machine-to-machine.

## Outbound Auth (Gateway → target)

Four modes: **none**, **OAuth (2LO and 3LO)**, **IAM SigV4**, and **API key**.

```
Target is public/unauthenticated?           → none
Needs the end user's identity and consent?  → OAuth 3LO
Machine-to-machine?                         → OAuth 2LO
An AWS endpoint?                            → IAM SigV4  ⚠ see matrix below
Legacy service with a static secret?        → API key (Secrets Manager, rotated)
```

### IAM SigV4 compatibility matrix

| Target endpoint | SigV4 outbound |
|-----------------|----------------|
| API Gateway | ✅ supported |
| Lambda Function URL | ✅ supported |
| Application Load Balancer | ❌ not supported |
| Direct EC2 endpoint | ❌ not supported |

A server behind an ALB must use OAuth or an API key. Confirm the target's
endpoint type *before* committing to SigV4 — this is a common design dead-end
discovered after the infrastructure is already provisioned.

**3LO for MCP-server targets** reached GA in **April 2026**, giving per-end-user
tokens for user-specific data with explicit consent.

## Semantic Tool Discovery

Gateway ships a built-in search tool, `x_amz_bedrock_agentcore_search`, for
natural-language tool lookup. This is the answer to tool overload: past a few
dozen tools, injecting every schema into every turn degrades routing accuracy and
inflates the token bill on every single request. Semantic discovery scales the
surface to thousands of tools without scaling the prompt.

Getting value from it depends entirely on description quality. Write each
description as a retrieval target: what it does, what it needs, when *not* to
reach for it.

## The DYNAMIC-Mode Gotcha

**`DYNAMIC` listing mode is incompatible with semantic search and with outbound
3LO.** If the design needs either — and any Gateway with a large tool surface
needs semantic search — do not choose `DYNAMIC`. Discovering this after
provisioning means rebuilding the target configuration.

Decide the listing mode at design time and record the decision with its reason.

## Rules

- Tool descriptions include a "do not use when" clause; they are written for a retriever.
- Check the SigV4 matrix before choosing SigV4; ALB and direct EC2 are out.
- Never inline a credential in a target configuration — Secrets Manager by ARN.
- Record the listing mode and why, given the `DYNAMIC` incompatibility.
- Scope the Gateway IAM role per target; a shared permissive role turns one
  injected tool call into lateral movement.
- Budget the invocation cost: $0.005/1,000 calls is small until an agent loops.

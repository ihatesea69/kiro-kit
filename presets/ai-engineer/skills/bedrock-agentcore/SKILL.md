---
name: bedrock-agentcore
description: >-
  Deploy and operate agents on Amazon Bedrock AgentCore — Runtime, Harness,
  Memory, Identity, and Observability. Use when hosting an agent on AWS,
  containerising an agent for AgentCore Runtime, wiring session or long-term
  memory, or choosing between Harness, Runtime, and plain Lambda.
---

# Amazon Bedrock AgentCore

Activate this skill when deploying an agent to AWS or wiring AgentCore
components together.

## When to Use

- Containerising a Strands / LangGraph / CrewAI / LlamaIndex / ADK agent for hosting
- Choosing a deployment target for an agent (Harness vs Runtime vs Lambda)
- Adding session or long-term memory to a chatbot
- Wiring agent tracing, metrics, and logs
- Hosting an MCP server on AgentCore Runtime

## Component Map

| Component | Purpose |
|-----------|---------|
| Runtime | Serverless deployment of an agent container |
| Gateway | Turns APIs, Lambdas, and services into MCP tools (see `agentcore-gateway-mcp`) |
| Memory | Short-term session context, long-term records |
| Identity | Access control for agents and callers |
| Observability | Traces, metrics, logs for agent runs |
| Code Interpreter | Sandboxed code execution as a tool |
| Browser tool | Headless browsing as a tool |

AgentCore was in preview from July 2025 and reached GA in October 2025 across
nine regions (`us-east-1`, `us-west-2`, `eu-central-1`, `ap-southeast-1`,
`ap-northeast-1` among them). **Do not assert that every component is GA** —
component availability moves. Check the
[release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)
and cite the date you checked.

## Choosing a Target

**AgentCore Harness** (GA June 2026) — no infrastructure, no container, no
orchestration loop. You call `CreateHarness` and then `InvokeHarness`. Model
providers include Bedrock, Anthropic, OpenAI, and Gemini. Use it when a hosted
model plus tools is genuinely enough.

**AgentCore Runtime** — you have agent code and want it hosted. Deliberately
framework-agnostic: CrewAI, LangGraph, LlamaIndex, Google ADK, the OpenAI Agents
SDK, and Strands Agents all run on it, with any FM in or out of Bedrock (OpenAI,
Gemini, Claude, Amazon Nova, Llama, Mistral), speaking **MCP** and **A2A**.

**Plain Lambda + `InvokeModel`** — it is not really an agent. One model call with
fixed post-processing does not need an agent runtime.

## Deploying to Runtime

The starter toolkit handles packaging, ECR, IAM, and the runtime resource:

```bash
pip install bedrock-agentcore-starter-toolkit
agentcore configure --entrypoint agent.py     # writes .bedrock_agentcore.yaml
agentcore launch                               # build + push + create/update runtime
agentcore invoke '{"prompt": "hello"}'         # smoke test
agentcore status
```

A minimal Runtime entrypoint:

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()
agent = Agent()  # Bedrock is the default model provider

@app.entrypoint
async def invoke(payload, context):
    # context carries session_id and the caller identity
    async for event in agent.stream_async(payload["prompt"]):
        yield event

if __name__ == "__main__":
    app.run()
```

Check the generated Dockerfile targets `linux/arm64` unless you have a reason to
prefer `amd64`, and that the image is as small as your dependency tree allows —
image size is cold-start latency.

## Hosting an MCP Server on Runtime

Two hard requirements, both easy to get wrong:

- The container **must serve at `0.0.0.0:8000/mcp`** — the default for most
  official MCP SDKs, so do not override the host or port.
- Transport is **streamable-HTTP**.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(host="0.0.0.0", stateless_http=True)

@mcp.tool()
def lookup_order(order_id: str) -> dict:
    """Return the status of an order by its id."""
    ...

mcp.run(transport="streamable-http")
```

Client side:

```python
from mcp.client.streamable_http import streamablehttp_client
from mcp import ClientSession

async with streamablehttp_client(url, headers={"Authorization": f"Bearer {token}"}) as (r, w, _):
    async with ClientSession(r, w) as session:
        await session.initialize()
        tools = await session.list_tools()
```

**OAuth**: Runtime follows RFC 6749. A request with no valid Bearer token gets
**HTTP 401 with a `WWW-Authenticate` header** (RFC 7235) pointing at the
authorization server; metadata is discoverable via
`GetRuntimeProtectedResourceMetadata`. Clients treat 401 as "fetch a token and
retry", not as terminal. See `mcp-server-hosting` for the full handshake.

## Memory

Three tiers, priced separately:

- Short-term events: **$0.25 per 1,000 events**
- Long-term records stored: **$0.75 per 1,000 records per month**
- Retrievals: **$0.50 per 1,000 retrievals**

Cheap per unit, material at chat volume. Put the arithmetic in the design, and
give long-term memory an explicit write policy — "persist everything" is both a
retrieval-noise problem and a privacy liability. Scope memory per user; a shared
store that leaks across tenants is a breach.

## Observability

Wire it before the first production invocation. Emit a trace per agent run with
subsegments per tool call, and carry a `session_id` and `correlation_id`
annotation on every span so a complaint can be traced to a conversation.

## Cost

Gateway and Memory prices above are stable enough to design against. **Do not
hardcode Runtime, Browser, or Code Interpreter compute pricing** — link
[AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) and let it
be the source of truth. For model tokens, express cost as drivers × volume and
link [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

## Rules

- Verify component status against the release notes; never claim blanket GA.
- Never hardcode compute or token prices; link the live pricing pages.
- MCP on Runtime: `0.0.0.0:8000/mcp`, streamable-HTTP. Non-negotiable.
- Keep business logic out of the framework's abstractions so Runtime stays a
  deployment detail, not a lock-in.
- Bound the tool loop (iterations, tokens, wall-clock) in code, not in the prompt.
- Smoke-test with `agentcore invoke` in a sandbox account before promoting.

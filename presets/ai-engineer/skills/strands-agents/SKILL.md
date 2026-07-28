---
name: strands-agents
description: >-
  Build agents with the Strands Agents SDK — the model-driven tool loop, custom
  tools, MCP clients, multi-agent patterns, streaming, and observability hooks.
  Use when writing agent code for this workspace, which defaults to Strands with
  Amazon Bedrock as the model provider.
---

# Strands Agents

The default agent framework for this workspace. Strands is AWS's lightweight,
code-first agent SDK: **Bedrock is the default model provider**, with Anthropic,
OpenAI, and Gemini also supported, and it runs on AWS, on other clouds, or
on-prem.

## When to Use

- Writing a new agent or chatbot in this workspace
- Adding tools to an existing Strands agent
- Connecting an agent to an MCP server or an AgentCore Gateway
- Building supervisor/worker multi-agent flows

## The Model-Driven Tool Loop

Strands does not ask you to draw a graph. You give the model a system prompt and
a set of tools; the model decides the sequence.

```python
from strands import Agent, tool

@tool
def lookup_order(order_id: str) -> dict:
    """Return status, items, and delivery estimate for a customer order.

    Args:
        order_id: The customer-facing order id, e.g. "ORD-10432".
    """
    return orders.get(order_id, {"error": "order not found", "retryable": False})

agent = Agent(
    model="anthropic.claude-sonnet-4-5-20250929-v1:0",
    system_prompt="You are a support assistant. Use tools before answering "
                  "questions about orders. If a tool returns an error, explain "
                  "it plainly; never invent an order status.",
    tools=[lookup_order],
)

result = agent("Where is ORD-10432?")
```

The docstring **is** the tool description the model sees. Write it for the model:
what it does, what the arguments mean, and when not to use it.

## Streaming

Perceived latency is the product's latency. Stream by default in anything
user-facing.

```python
async for event in agent.stream_async(prompt):
    if "data" in event:
        yield event["data"]
```

## MCP Tools

Point the agent at a Gateway endpoint or a standalone MCP server and its tools
join the loop alongside native `@tool` functions:

```python
from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp import MCPClient

gateway = MCPClient(lambda: streamablehttp_client(
    GATEWAY_URL, headers={"Authorization": f"Bearer {access_token}"}))

with gateway:
    agent = Agent(tools=[lookup_order, *gateway.list_tools_sync()])
    result = agent(prompt)
```

For a large Gateway surface, prefer semantic discovery
(`x_amz_bedrock_agentcore_search`) over listing everything — see
`agentcore-gateway-mcp`.

## Multi-Agent

Supervisor/worker is the default shape: one router, N specialists, no
worker-to-worker chatter. Expose each worker to the supervisor as a tool, so
delegation reuses the same loop and the same tracing.

```python
@tool
def billing_specialist(question: str) -> str:
    """Answer billing, invoice, and refund questions. Use only for billing."""
    return str(Agent(system_prompt=BILLING_PROMPT, tools=BILLING_TOOLS)(question))

supervisor = Agent(system_prompt=ROUTER_PROMPT,
                   tools=[billing_specialist, shipping_specialist])
```

Cross-runtime workers reached over **A2A** follow the same contract: a typed task
in, a typed result out. Budget tokens and wall-clock across the whole tree, not
per agent, or a fan-out costs an order of magnitude more than the estimate.

Reach for **LangGraph** instead when durable checkpoints and resumable
long-running work are the dominant requirement — Strands' strength is the lean
loop, not multi-hour durable execution.

## Guardrails

Attach a Bedrock Guardrail so input and output are both filtered, rather than
relying on prompt text:

```python
from strands.models import BedrockModel

model = BedrockModel(
    model_id="anthropic.claude-sonnet-4-5-20250929-v1:0",
    guardrail_id=GUARDRAIL_ID,
    guardrail_version="DRAFT",
)
```

## Observability and Hooks

Strands exposes lifecycle hooks — use them for tracing, cost accounting, and the
caps that the prompt must never be trusted to enforce:

- Emit a span per tool call with arguments (PII-redacted) and duration.
- Accumulate input/output tokens per request and abort past the budget.
- Enforce a hard maximum iteration count in code.
- Carry `session_id` and `correlation_id` as span annotations.

## Rules

- Tool docstrings are the model's API documentation; include a "do not use when".
- Tools return errors as data (`{"error": ..., "retryable": ...}`), never raise
  into the loop.
- Truncate tool results at the boundary — a large result is re-paid on every
  subsequent turn and is the top source of runaway cost.
- Iteration, token, and wall-clock caps live in code, with a test.
- Keep business logic in plain functions; the `@tool` wrapper stays thin so the
  logic survives a framework change.
- Stream in anything user-facing.
- Every agent ships with an eval harness in the same PR (see `agent-evaluation`).

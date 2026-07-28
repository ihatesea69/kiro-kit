---
inclusion: always
description: Single-agent tool loops, multi-agent orchestration, memory and session strategy, and the guardrails-first default for chatbots and agents.
---

# Agent Design Patterns

## Start With the Smallest Thing That Works

Escalate only when the smaller pattern demonstrably fails:

1. **Prompt + structured output** — no tools, no loop. Classification,
   extraction, rewriting.
2. **Single agent, small tool set** — a model-driven tool loop over 3–8 tools.
   This handles the large majority of real chatbots.
3. **Single agent, retrieved tool set** — same loop, but tools are discovered
   semantically (see `mcp-architecture`). Use when the surface exceeds a few
   dozen tools.
4. **Multi-agent** — a supervisor decomposing work to specialised workers. Only
   when sub-tasks need genuinely different tools, prompts, or models, or must run
   concurrently.

Every level up costs latency, tokens, and debuggability. A design that jumps
straight to multi-agent must say what it tried first.

## The Single-Agent Tool Loop

The model picks tools; your code owns the invariants around it.

- **Bound the loop.** A hard maximum iteration count and a token budget per
  request, enforced in code — never trusted to the prompt.
- **Make tools idempotent** where possible. Retries and duplicate deliveries are
  normal, not exceptional.
- **Return errors as data.** A tool that raises kills the turn; a tool that
  returns `{"error": "order not found", "retryable": false}` lets the model
  recover or explain.
- **Keep tool results small.** Truncate and summarise at the tool boundary. A
  10 kB tool result paid for on every subsequent turn is the most common source
  of runaway cost.
- **Stream to the user.** Perceived latency is the product's latency.

## Multi-Agent Orchestration

- **Supervisor / worker** is the default shape: one router, N specialists, no
  worker-to-worker chatter. Free-form agent meshes are close to impossible to
  debug or evaluate.
- **Workers get contracts, not conversations.** A worker receives a typed task
  and returns a typed result. That contract is what you test.
- **Detect loops.** Track the delegation chain; abort on repeats and on depth
  limits.
- **Budget globally, not per agent.** One request's total token and wall-clock
  budget is shared across the whole tree, or a fan-out will quietly cost 20×.
- **Partial failure is the normal case.** Decide up front whether the supervisor
  degrades gracefully or fails the request; say which in the design.

## Memory and Session Strategy

Distinguish three things that get sloppily called "memory":

| Kind | Lifetime | Typical store | Question it answers |
|------|----------|---------------|---------------------|
| **Working context** | One turn | The prompt | What am I doing right now? |
| **Session / short-term** | One conversation | AgentCore Memory events | What did we just say? |
| **Long-term** | Across conversations | AgentCore Memory records | What do I know about this user? |

Rules of thumb:

- **Summarise, don't accumulate.** Replaying a full transcript every turn grows
  cost quadratically. Roll older turns into a summary at a fixed threshold.
- **Long-term memory needs a write policy.** Decide what is worth persisting
  before you persist it; "store everything" becomes a privacy liability and a
  retrieval-noise problem simultaneously.
- **Long-term memory is user data.** It is subject to deletion requests, and it
  must be scoped per user — never leaked across tenants.
- Memory costs $0.25 per 1,000 short-term events, $0.75 per 1,000 long-term
  records stored per month, and $0.50 per 1,000 retrievals. It is cheap per unit
  and expensive at chat volume; put the arithmetic in the design.

## Guardrails First

Guardrails are configured before the first user sees the agent, not bolted on
after an incident. See `responsible-ai` for the detail. The pattern is:

```
user input → input guardrail → agent loop → output guardrail → user
                                  ↑
                        tool results are ALSO untrusted input
```

That last arrow is the one people miss: a tool result, a retrieved document, and
a web page are all attacker-influenceable. They are data, never instructions.

## Rules

1. Justify the pattern level; name what you tried below it.
2. Iteration caps and token budgets live in code, enforced, with a test.
3. Tools return errors as data; tool results are truncated at the boundary.
4. Multi-agent means supervisor/worker with typed contracts and loop detection.
5. Memory has an explicit tier, a write policy, a retention period, and a cost line.
6. Guardrails on input and output, before launch.

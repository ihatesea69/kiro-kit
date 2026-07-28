---
inclusion: always
description: Amazon Bedrock AgentCore component map, and how to choose between Harness, Runtime, and plain Lambda when shipping an agent.
---

# AWS-Native Agents

This workspace builds agents and chatbots that run on AWS. The default target is
**Amazon Bedrock AgentCore**; the default framework is **Strands Agents**. Both
are defaults, not constraints — AgentCore Runtime is deliberately
framework-agnostic, so a design that picks LangGraph or CrewAI for a good reason
is still on-pattern.

## Component Map

AgentCore is not one service; it is a set of composable pieces. Name the ones
you use, and say why.

| Component | What it gives you | Reach for it when |
|-----------|-------------------|-------------------|
| **Runtime** | Serverless deployment of an agent container | You have agent code and want it hosted with scaling, isolation, and identity |
| **Gateway** | Turns APIs, Lambda functions, and existing services into MCP tools; also fronts pre-existing MCP servers | The agent needs tools, and you do not want to hand-roll an MCP layer per tool |
| **Memory** | Short-term session context and long-term records | Conversations span turns or sessions and the agent must remember |
| **Identity** | Access control for agents and their callers | Agents act on behalf of a user, or call resources that need scoped credentials |
| **Observability** | Traces, metrics, and logs for agent runs | Always — wire it before the first production invocation |
| **Code Interpreter** | Sandboxed code execution as a tool | The agent must compute, transform data, or run generated code |
| **Browser tool** | Headless browsing as a tool | The agent must read or drive a real web page |

**Do not claim a blanket "everything is GA".** AgentCore went to preview in
July 2025 and GA in October 2025 across nine regions (including `us-east-1`,
`us-west-2`, `eu-central-1`, `ap-southeast-1`, `ap-northeast-1`), but component
availability moves. Check the
[release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)
at design time and cite what you found, with the date you checked.

## Choosing a Deployment Target

```
Do you need custom orchestration code or a custom container?
├─ No, and a hosted provider model + tools is enough
│    → AgentCore Harness (CreateHarness / InvokeHarness)
│      No infrastructure, no container, no orchestration loop to write.
│      GA June 2026. Providers: Bedrock, Anthropic, OpenAI, Gemini.
│
├─ Yes — you have agent code (Strands / LangGraph / CrewAI / LlamaIndex /
│   Google ADK / OpenAI Agents SDK) or a custom loop
│    → AgentCore Runtime
│      Framework-agnostic; any FM in or out of Bedrock; MCP and A2A.
│
└─ It is not really an agent — a single model call with fixed post-processing
     → Plain Lambda + InvokeModel. Do not pay for an agent runtime to run a
       prompt. Say so in the design rather than reaching for AgentCore by reflex.
```

Corollary: **an agent is not the default answer.** If the task is deterministic,
write the deterministic thing. Reserve the tool loop for problems where the
sequence of steps genuinely depends on intermediate results.

## Framework-Agnostic by Design

Runtime accepts CrewAI, LangGraph, LlamaIndex, Google ADK, the OpenAI Agents
SDK, and Strands Agents, and speaks both **MCP** and **A2A**. Models may be
Bedrock-hosted or not — OpenAI, Gemini, Claude, Amazon Nova, Llama, and Mistral
are all in scope.

Practical consequences for design docs in this workspace:

- **Never couple business logic to a framework's abstractions.** Tools, prompts,
  and the evaluation harness must survive a framework swap.
- **Pick the framework for the failure mode you fear.** Strands for a lean
  code-first tool loop with Bedrock as the default provider; LangGraph when
  durable checkpoints and resumable long-running work dominate; CrewAI or ADK
  when you are inheriting an existing team's stack.
- **State the choice as a decision, with the alternative you rejected.**

## Cost Discipline

Some AgentCore prices are stable enough to design against; others are not.

- **Gateway**: $0.005 per 1,000 API invocations, plus $0.02 per 100 tools indexed
  per month.
- **Memory**: $0.25 per 1,000 short-term events; $0.75 per 1,000 long-term
  records stored per month; $0.50 per 1,000 retrievals.
- **Runtime / Browser / Code Interpreter compute**: do **not** hardcode
  per-vCPU-hour figures into a design or a skill. Link
  [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) and let
  it be the source of truth.
- **Model tokens**: express the cost model in drivers (input tokens, output
  tokens, embedding calls, retrievals per turn) and link
  [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/). Never invent a
  per-token number.

Every design.md ships a cost model as *drivers × volume*, not a single made-up
monthly figure.

## Rules

1. Name the AgentCore components you use and justify each one.
2. Verify component status against the release notes; cite the date you checked.
3. Choose Harness / Runtime / plain Lambda explicitly, with the rejected option stated.
4. Keep business logic framework-portable.
5. Link live pricing pages for compute and tokens; only quote the Gateway and
   Memory prices above as fixed figures.
6. Observability is wired before the first production invocation, not after the
   first incident.

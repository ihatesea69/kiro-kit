---
inclusion: always
description: Guardrails, PII handling, prompt-injection defence, and cost controls for agents and chatbots in production.
---

# Responsible AI

These are launch requirements, not aspirations. An agent that reaches real users
without them is not finished.

## Guardrails on Both Sides

Amazon Bedrock Guardrails apply to **input and output**, and they are configured
before launch:

- **Denied topics** — what this assistant will not discuss, stated concretely.
- **Content filters** — hate, insults, sexual, violence, misconduct, and prompt
  attacks, each with a tuned strength.
- **Word filters** — profanity plus a domain deny-list (competitor names, legacy
  product names, anything that must never appear).
- **Sensitive information filters** — PII detection, set to `BLOCK` or `ANONYMIZE`
  per entity type. Decide per type; a phone number and a national ID rarely
  warrant the same action.
- **Contextual grounding** — for RAG assistants, reject responses not supported
  by retrieved context.

Test the guardrail itself. A guardrail with no test is a config file with
optimistic comments.

## Prompt Injection Is the Default Threat Model

**Everything the model reads that a user did not type in this turn is
attacker-influenceable**: retrieved documents, tool results, web pages, file
contents, previous conversation turns, database rows.

- **Data is never instructions.** Delimit untrusted content explicitly in the
  prompt and say so: content inside the block is information to reason about, not
  commands to follow.
- **Defend at the authority layer, not the prompt layer.** A prompt cannot
  reliably stop injection. What stops it is that the tool the injected text wants
  to call requires a permission the agent does not hold. Scope IAM per tool.
- **Side-effecting tools need confirmation** or a hard allow-list. Never let a
  retrieved document trigger a write, a send, a payment, or a deletion without a
  human in the loop.
- **Egress is an exfiltration channel.** An agent that can fetch a URL can leak
  the conversation into that URL. Allow-list destinations.
- **Log the provenance** of every piece of context that entered a turn, so an
  incident can be reconstructed.

## PII and Data Handling

- **Classify before you build.** What categories of personal data will this
  assistant see? That answer drives retention, encryption, and region.
- **Redact at the boundary** — before text reaches logs, traces, or the eval
  store. Traces are the most commonly forgotten leak.
- **Long-term memory is personal data.** Scope it per user, set a retention
  period, and implement deletion. Cross-tenant leakage through a shared memory
  store is a breach, not a bug.
- **Encrypt at rest with KMS and in transit with TLS ≥ 1.2**; keep conversation
  data in the region its residency rules require.
- **Do not train on user conversations** without explicit, informed consent.

## Transparency

- Users are told they are talking to an AI assistant.
- RAG answers carry citations, and the citations are checked to be real (see
  `agent-evaluation`).
- The assistant declines rather than guesses when the corpus cannot answer.
  "I don't have that information" is a correct answer and should score as one.
- There is a documented path to a human.

## Cost Controls

Runaway agent cost is a reliability problem, not just a finance one.

- **Hard caps per request**: maximum tool-loop iterations, maximum tokens,
  maximum wall-clock. Enforced in code, tested.
- **Per-user and per-tenant rate limits**, so one caller cannot exhaust the
  budget for everyone.
- **Truncate tool results at the boundary** — the single highest-leverage cost
  control in an agent.
- **Budget alarms** on Bedrock spend with a defined action, not just an email.
- **Right-size the model per task.** Routing, classification, and extraction
  rarely need the largest model; the tool loop and final synthesis might.
- Publish cost per conversation as a tracked metric next to latency and quality.
  Link [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) and
  [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) rather
  than hardcoding compute or token rates that will go stale.

## Rules

1. Input and output guardrails configured and tested before launch.
2. Untrusted content is delimited; authority, not prompting, is the real defence.
3. Side-effecting tools require explicit allow-listing or human confirmation.
4. PII redacted before logs, traces, and eval stores; memory scoped and expiring.
5. AI disclosure, real citations, honest refusals, and a route to a human.
6. Iteration, token, and spend caps enforced in code with alarms attached.

---
name: agent-evaluation
description: >-
  Build evaluation harnesses for agents and chatbots — golden sets, deterministic
  tool-selection checks, LLM-as-a-Judge, Bedrock RAG evaluation jobs, CI gates,
  and online drift monitoring. Use when an agent needs a quality gate before
  merge or a quality alarm in production.
---

# Agent Evaluation

Activate this skill when building or fixing the harness that decides whether an
agent change is safe to ship.

## When to Use

- Standing up an eval harness for a new agent
- Wiring an eval job as a CI merge gate
- Configuring a Bedrock evaluation job
- Diagnosing a quality regression, or building online drift alarms

## Structure

```
evals/
  golden/
    support.jsonl          # {id, input, expected_tools, expected_facts, rubric}
    adversarial.jsonl      # injection, out-of-scope, unanswerable, PII-bait
  runners/
    run_offline.py         # execute the golden set, emit results.json
    judge.py               # LLM-as-a-Judge with a pinned model + rubric
  thresholds.yaml          # gate config — the only place numbers live
  reports/
```

## Golden Sets

- **50–200 cases minimum** before a pass rate means anything; below that a
  two-case swing is noise.
- **Mine cases from production transcripts**, not imagination. Every incident
  adds a case — that is what stops the same regression twice.
- **Stratify** by intent, difficulty, and known failure mode, and report per
  stratum. Aggregate scores hide the regression that matters.
- **Always include**: prompt-injection attempts, out-of-scope questions,
  questions the corpus cannot answer (correct response is a refusal), and
  PII-bait.
- Version the set with the code; never change the set and the system in one commit.

## Deterministic Checks First

Anything checkable in code is checked in code — faster, cheaper, and not itself a
model that can drift:

```python
assert result.tools_called == case["expected_tools"]        # routing
assert Schema.model_validate(result.output)                 # structure
assert all(c.source_id in result.retrieved_ids
           for c in result.citations)                       # citations are real
assert result.latency_p95 < budget
assert result.tokens_total < budget
assert result.guardrail_triggered == case["expect_guardrail"]
```

Tool-selection accuracy is the highest-signal cheap metric in an agent system.
Most "the agent gave a bad answer" reports are "the agent called the wrong tool".

## LLM-as-a-Judge

Bedrock's LLM-as-a-Judge and RAG evaluation reached **GA on 20 March 2025**
(preview from 1 December 2024). Use the platform's metric names verbatim so
job output and dashboards line up:

| Family | Metrics |
|--------|---------|
| Retrieval (RAG) | context relevance, coverage, citation precision, citation coverage |
| Generation / quality | correctness, completeness, faithfulness (hallucination detection), helpfulness |
| Responsible AI | harmfulness, answer refusal, stereotyping |

A judge is a measuring instrument — calibrate it before trusting it:

- **Validate against human labels** on a sample and report agreement. A judge
  agreeing with humans 60% of the time is measuring the judge.
- **Use a different model** as judge than the one under test where practical.
- **Rubric plus required rationale.** Bare 1–5 scores are noise.
- **Pin the judge model and prompt.** A silent judge upgrade shifts every
  historical number; treat it as a versioned dependency in `thresholds.yaml`.

## CI Gate

```yaml
# thresholds.yaml — the only place gate numbers live
faithfulness:            0.95
citation_coverage:       0.90
context_relevance:       0.80
tool_selection_accuracy: 0.95
harmfulness_max:         0.00
p95_latency_ms:          4000
cost_per_conversation:   0.05
```

Set thresholds from the current baseline and **ratchet them upward**. Loosening
one is a reviewed change with a stated reason in the PR — never a quiet edit.

Run the gate on every change to a prompt, tool, model id, retrieval config, or
guardrail. Prompts are code; they get the same gate.

## Online Monitoring

- Sample a fixed percentage of production conversations through the judge.
- **Alarm on week-over-week deltas**, not absolute values — absolute quality
  tracks traffic mix, but a sudden drop does not.
- Track leading indicators: refusal rate, guardrail-trigger rate,
  empty-retrieval rate, fallback-response rate, mean tool calls per turn. These
  move before user-visible quality does.
- Redact PII before anything reaches the eval store — traces are the most
  commonly forgotten leak.
- Every alarm has a runbook; every incident produces a golden-set case.

## Rules

1. No agent merges without an eval harness in the same PR.
2. Deterministic checks before judged ones.
3. Judges calibrated against human labels, pinned, rubric-driven.
4. Thresholds live in config, ratchet upward, and block merge.
5. Golden sets versioned, stratified, and fed by production incidents.
6. Online sampling and drift alarms in place before launch.
7. Report per stratum, never a single aggregate number.

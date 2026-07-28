---
inclusion: always
description: Evaluation as a CI gate — golden sets, LLM-as-a-Judge, Bedrock RAG evaluation metrics, and online quality monitoring.
---

# Agent Evaluation

An agent without an evaluation harness is a demo. This workspace treats eval as
a build artifact with the same standing as tests: it lands in the same PR as the
behaviour it measures, and it gates merge.

## Two Loops

- **Offline** — a fixed golden set, run in CI on every change to a prompt, tool,
  model, or retrieval config. Deterministic enough to block a merge.
- **Online** — sampled production traffic, scored continuously, alerting on
  drift. Catches what the golden set does not contain, which is most of reality.

Both are required. Offline alone goes stale; online alone cannot stop a bad
change from shipping.

## Golden Sets

- **50–200 cases minimum** before you trust a pass rate. Below that, a two-case
  swing is noise.
- **Cases come from production**, not from imagination. Mine real transcripts;
  every incident adds a case.
- **Stratify** by intent, difficulty, and known failure mode, and report per
  stratum. An aggregate score hides the regression that matters.
- **Version the set** alongside the code. Changing the set and the system in one
  commit makes the result unreadable.
- **Include adversarial cases**: prompt injection, out-of-scope questions,
  questions the corpus cannot answer (the correct response is a refusal), and
  PII-bait.

## What to Measure

**Deterministic first.** Anything checkable in code should be checked in code —
it is faster, cheaper, and not itself a model that can drift:

- Did the right tool get called, with the right arguments?
- Did the output parse against the schema?
- Are all cited sources real and present in the retrieved set?
- Latency p50/p95, tokens per turn, cost per conversation.
- Was the guardrail triggered when it should have been?

**Then judged.** Use LLM-as-a-Judge for what code cannot check. Amazon Bedrock's
LLM-as-a-Judge and RAG evaluation capabilities went **GA on 20 March 2025**
(preview from 1 December 2024).

| Family | Metrics |
|--------|---------|
| Retrieval (RAG) | context relevance, coverage, citation precision, citation coverage |
| Generation / quality | correctness, completeness, faithfulness (hallucination detection), helpfulness |
| Responsible AI | harmfulness, answer refusal, stereotyping |

Use these names verbatim when configuring a Bedrock evaluation job — matching
the platform's vocabulary keeps dashboards and job output aligned.

## Judge Discipline

An LLM judge is a measuring instrument. Calibrate it before trusting it.

- **Validate against human labels** on a sample. Report agreement. A judge that
  agrees with humans 60% of the time is measuring the judge.
- **Use a different model as judge** than the one under test where practical.
- **Judge with a rubric and require a rationale.** Bare 1–5 scores are noise.
- **Pin the judge model and prompt.** A silent judge upgrade shifts every
  historical number; treat it as a versioned dependency.

## CI Gates

Wire it as a gate, with thresholds in a config file, not in a comment:

```
merge blocked if:
  faithfulness           < threshold      # hallucination
  citation coverage      < threshold      # unsupported claims
  tool-selection accuracy < threshold     # deterministic
  harmfulness             > threshold     # safety — no tolerance band
  p95 latency            > budget
  cost/conversation      > budget
```

Thresholds are set from the current baseline and ratcheted upward, never
loosened silently. Loosening one is a reviewed change with a stated reason.

## Online Monitoring

- Sample a fixed percentage of production conversations through the judge.
- Alarm on **week-over-week deltas**, not absolute values — absolute quality
  varies with traffic mix; a sudden drop does not.
- Track refusal rate, guardrail-trigger rate, empty-retrieval rate, and
  fallback-response rate. These move before user-visible quality does.
- Every alarm has a runbook, and every incident produces a golden-set case.

## Rules

1. No agent merges without an eval harness in the same PR.
2. Deterministic checks before judged ones.
3. Judges are calibrated against human labels, pinned, and rubric-driven.
4. Thresholds live in config, are ratcheted up, and block merge.
5. Golden sets are versioned, stratified, and fed by production incidents.
6. Online sampling and drift alarms are in place before launch.

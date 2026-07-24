---
inclusion: always
description: ADR format (context / decision / consequences), numbering, statuses, and when a decision deserves a record.
---

# Architecture Decision Records

An ADR captures one significant decision, its context, and its consequences —
so future maintainers learn *why*, not just *what*.

## When to Write One

Write an ADR when a decision is:
- **Costly to reverse** (database engine, event bus vs queues, single- vs multi-table, region strategy), or
- **Repeatedly questioned** (write it once, point people at it), or
- **A pillar trade-off** (chose cost over latency, availability over consistency).

Do NOT write ADRs for reversible implementation details, style choices covered
by steering files, or decisions forced by hard constraints (record those as
constraints in the SAD instead).

## Location & Naming

- Directory: `docs/adr/`
- Filename: `NNNN-short-kebab-title.md` (e.g. `0007-eventbridge-over-sns.md`),
  numbers never reused.
- Index: keep `docs/adr/README.md` as a table (number, title, status, date).

## Format

```markdown
# ADR-0007: EventBridge over direct SNS fan-out

- **Status**: Accepted        <!-- Proposed | Accepted | Deprecated | Superseded by ADR-NNNN -->
- **Date**: 2026-07-24
- **Deciders**: SA team, platform lead

## Context

What forces are at play — technical, organisational, cost. 2–4 paragraphs max.
State the requirement IDs driving this (e.g. R3.1 event routing, R5.2 audit).

## Decision

One paragraph, active voice: "We will use a single EventBridge custom bus with
one rule per consumer service."

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| EventBridge bus | Content filtering, archive/replay, schema registry | Per-event cost, 24h replay setup |
| SNS → SQS fan-out | Cheapest, simple | No content routing, no replay |
| Kafka (MSK) | Ordering, retention | Ops burden, oversized for volume |

## Consequences

The good, the bad, and the follow-ups — including new risks, cost deltas, and
what becomes easier/harder. If this supersedes an ADR, link both directions.
```

## Rules

- One decision per ADR; ADRs are immutable once Accepted — supersede, don't edit.
- Every ADR references the requirements or pillar trade-off that motivated it.
- design.md carries an ADR summary table; full text lives in `docs/adr/`.
- Status changes are commits, so history shows when thinking changed.

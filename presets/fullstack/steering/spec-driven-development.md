---
inclusion: always
description: How to write good Kiro specs — the requirements→design→tasks flow, EARS acceptance criteria, approval gates, and when a lightweight plan is enough.
---

# Spec-Driven Development

Kiro specs turn an idea into an implementation plan through three files created in
sequence, each reviewed before the next. Use this for genuinely complex features;
use a lightweight plan for small changes (see "When not to spec").

## The three files

1. **requirements.md** — the *what* and *why*. User stories plus acceptance
   criteria in EARS notation.
2. **design.md** — the *how*. Architecture, data models, diagrams, error handling,
   and testing strategy. Must cover every requirement.
3. **tasks.md** — the *plan*. Discrete, ordered, traceable tasks.

An editable starting point for each lives in `.kiro/specs/_templates/`, and a
fully worked reference for your stack lives in `.kiro/specs/examples/`.

## Approval gates

Create the files in order and **stop for review at each gate**:

- After requirements: ask "Do the requirements look good? If so, we move to design."
- After design: confirm it covers all requirements before writing tasks.
- Never jump to design or code while requirements are still in flux.

## EARS acceptance criteria

Every criterion must be testable and unambiguous. Use these patterns:

- `WHEN <event> THE SYSTEM SHALL <response>` — event-driven behavior
- `WHILE <state> THE SYSTEM SHALL <behavior>` — continuous behavior
- `IF <condition> THEN THE SYSTEM SHALL <response>` — conditional/error behavior
- `WHERE <context> THE SYSTEM SHALL <behavior>` — context-specific behavior

Cover the happy path **and** edge cases (empty, invalid, unauthorized, timeout,
duplicate) **and** non-functionals (security, performance, accessibility).

## Traceability

In `tasks.md`, each top-level task ends with the acceptance criteria it satisfies:

```
- [ ] 3. Implement rate limiter middleware
  - [ ] 3.1 Token-bucket store keyed by API key
  - [ ] 3.2 Emit RateLimit-* headers and 429 on exhaustion
  - _Requirements: R2.1, R2.3, R4.2_
```

This lets anyone trace a line of code back to the requirement that justifies it.

## Design must be complete

The design covers *all* requirements, includes at least one diagram for non-trivial
flows (Mermaid), and documents data models, error paths, security, and how it will
be tested. If the design can't satisfy a requirement, fix the requirement first.

## When not to spec

The full workflow is overkill for small work. For a one-line bug fix or a trivial
tweak, write a short plan (or use a `bugfix.md`) instead of inventing user stories
and sixteen acceptance criteria. Reserve specs for features where context stability
across many steps actually pays off. Match the ceremony to the risk.

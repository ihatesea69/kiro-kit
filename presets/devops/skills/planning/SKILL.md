---
name: planning
description: >-
  Plan technical solutions that are scalable, secure, and maintainable. Use when
  you need to create implementation plans or evaluate architectural approaches.
license: MIT
---

# Planning

Activate this skill when creating implementation plans or evaluating technical approaches.

## When to Use

- Starting a new feature or system component
- Evaluating multiple architectural approaches
- Breaking down complex work into phases
- Estimating effort and identifying risks
- Creating migration or upgrade plans

## Process

1. Define success criteria and constraints
2. Research relevant patterns and prior art
3. Decompose into phases with clear deliverables
4. Identify dependencies and critical path
5. Assess risks and define mitigations
6. Document the plan with actionable steps

## Output Structure

Create plans in `plans/YYYYMMDD-HHmm-plan-name/`:
- `plan.md`: overview with phase list and status
- `phase-XX-name.md`: per-phase details

## Rules

- Every task should be completable in 30 min to 2 hours
- Include rollback strategy for risky phases
- Identify what can be parallelized
- List unresolved questions at the end
- Apply YAGNI, KISS, DRY to every recommendation

---
description: Plan a refactoring effort with risk assessment
inclusion: manual
argument-hint: "[target] [goal]"
---

## Arguments
TARGET: $1 (required, module or area to refactor)
GOAL: $2 (required, what the refactoring should achieve)

## Workflow
1. Analyze current implementation and its issues
2. Define refactoring goals and constraints
3. Identify affected tests and dependent code
4. Plan incremental steps (each independently deployable)
5. Assess risk of regressions per step
6. Generate plan with rollback strategy

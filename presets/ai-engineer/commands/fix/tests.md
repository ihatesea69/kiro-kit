---
description: Diagnose and fix failing tests
inclusion: manual
argument-hint: "[test-path]"
---

## Arguments
PATH: $1 (default: tests/)

## Workflow
1. Run `pytest $PATH -x --tb=short` to identify first failure
2. Analyze error message and traceback
3. Identify root cause (code bug vs test bug vs environment)
4. Apply fix to source or test as appropriate
5. Re-run failing test to verify fix
6. Run full suite to check for regressions


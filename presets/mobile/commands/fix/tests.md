---
description: Diagnose and fix failing tests
inclusion: manual
argument-hint: "[test-path]"
---

## Arguments
PATH: $1 (default: test/, path to failing tests)

## Workflow
1. Run failing tests and capture output
2. Analyze failure messages and stack traces
3. Identify root cause (code bug vs test bug)
4. Apply fix to code or test as appropriate
5. Re-run tests to verify fix
6. Report resolution and any remaining issues

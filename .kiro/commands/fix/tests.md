---
description: Investigate and fix failing tests
inclusion: manual
argument-hint: "[test-pattern]"
---

## Arguments
PATTERN: $1 (default: all failing tests)

## Workflow
1. Run test suite and identify failures
2. Analyze error messages and stack traces
3. Determine root cause (code bug vs test bug)
4. Apply fix to source or test as appropriate
5. Re-run affected tests to verify fix
6. Report results

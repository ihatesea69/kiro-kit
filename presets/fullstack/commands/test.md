---
description: Run the test suite with coverage reporting
inclusion: manual
argument-hint: "[pattern]"
---

## Arguments
PATTERN: $1 (default: all tests)

## Workflow
1. Run Vitest with coverage: `npx vitest run --coverage`
2. If pattern provided, filter tests: `npx vitest run $1`
3. Report test results summary (passed, failed, skipped)
4. Report coverage metrics (lines, branches, functions)
5. Highlight any failing tests with error details

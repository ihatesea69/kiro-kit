---
description: Run the test suite with coverage reporting
inclusion: manual
argument-hint: "[pattern]"
---

## Arguments
PATTERN: $1 (default: all tests)

## Workflow
1. Run test suite with coverage: `npm test -- --coverage`
2. If pattern provided, filter tests: `npm test -- $1`
3. Report test results summary (passed, failed, skipped)
4. Report coverage metrics (lines, branches, functions)
5. Highlight any failing tests with error details

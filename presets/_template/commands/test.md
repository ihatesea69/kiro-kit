---
description: Run the project test suite
inclusion: manual
argument-hint: "[scope] [flags]"
---

## Arguments
SCOPE: $1 (default: all)
FLAGS: $2 (default: empty)

## Workflow
1. Detect test runner (vitest, jest, pytest, go test, cargo test)
2. Run tests for the specified scope
3. Report pass/fail summary with coverage if available
4. Highlight failing tests with error details

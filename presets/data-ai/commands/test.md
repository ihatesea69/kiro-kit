---
description: Run test suite with coverage reporting
inclusion: manual
argument-hint: "[test-path] [markers]"
---

## Arguments
PATH: $1 (default: tests/)
MARKERS: $2 (default: none, options: unit, integration, slow, gpu)

## Workflow
1. If MARKERS specified: run `pytest $PATH -m "$MARKERS" --cov`
2. Otherwise: run `pytest $PATH --cov --cov-report=term-missing`
3. Report coverage summary
4. Highlight uncovered critical paths
5. Suggest tests for uncovered code


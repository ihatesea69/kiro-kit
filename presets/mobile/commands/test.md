---
description: Run the test suite with coverage reporting
inclusion: manual
argument-hint: "[test-type] [path]"
---

## Arguments
TYPE: $1 (default: unit, options: unit, widget, integration, all)
PATH: $2 (default: test/)

## Workflow
1. Run specified test type with coverage enabled
2. For Flutter: `flutter test --coverage $PATH`
3. For React Native: `npx jest --coverage $PATH`
4. Analyze coverage report and identify gaps
5. Report results: passed, failed, skipped, coverage percentage
6. Highlight any flaky tests detected

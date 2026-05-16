---
description: Auto-fix linting issues in Python code
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: src/)

## Workflow
1. Run `ruff check --fix $PATH` for auto-fixable issues
2. Run `ruff format $PATH` for formatting
3. Run `isort $PATH` for import sorting
4. Report remaining issues that need manual fixes
5. Run type check to verify fixes did not break types


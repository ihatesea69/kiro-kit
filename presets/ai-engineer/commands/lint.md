---
description: Run linting and type checking on Python codebase
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: src/)

## Workflow
1. Run `ruff check $PATH` for fast linting
2. Run `ruff format --check $PATH` for formatting verification
3. Run `mypy $PATH` for type checking
4. Report issues grouped by severity
5. Suggest `ruff check --fix` for auto-fixable issues


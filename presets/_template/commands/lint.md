---
description: Run linting across the project and report issues
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: src)

## Workflow
1. Detect available linter (eslint, biome, ruff, golangci-lint)
2. Run linter on the specified path
3. Report errors and warnings with file locations
4. Suggest auto-fix command if issues found

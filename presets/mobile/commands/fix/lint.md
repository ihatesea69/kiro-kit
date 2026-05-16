---
description: Auto-fix linting and formatting issues
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: ".", entire project)

## Workflow
1. Run linter with auto-fix enabled (`dart fix --apply` or `eslint --fix`)
2. Run formatter (`dart format` or `prettier --write`)
3. Remove unused imports
4. Report remaining issues that require manual intervention

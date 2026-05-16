---
description: Run static analysis and linting on the mobile codebase
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: ".", the entire project)

## Workflow
1. Run `flutter analyze` or `npx eslint` based on project type
2. Check for unused imports and dead code
3. Verify formatting (`dart format` or `prettier`)
4. Report issues grouped by severity (error, warning, info)
5. Suggest auto-fixable issues that can be resolved with `--fix`

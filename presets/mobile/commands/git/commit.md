---
description: Stage and commit changes with conventional commit message
inclusion: manual
argument-hint: "[type] [scope]"
---

## Arguments
TYPE: $1 (default: auto-detect, options: feat, fix, docs, refactor, test, chore)
SCOPE: $2 (optional, e.g., auth, navigation, ui)

## Workflow
1. Stage relevant files (avoid unrelated changes)
2. Scan for secrets or credentials in diff
3. Generate conventional commit message from changes
4. Commit with proper format: `type(scope): description`
5. Report commit hash and summary

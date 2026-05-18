---
description: Stage and commit changes with conventional commit message
inclusion: manual
argument-hint: "[type] [scope] [message]"
---

## Arguments
TYPE: $1 (default: auto-detect, options: feat, fix, docs, refactor, test, chore)
SCOPE: $2 (optional, affected module)
MESSAGE: $3 (optional, commit description)

## Workflow
1. Review staged changes (or stage all if nothing staged)
2. Scan for secrets or credentials in diff
3. Generate conventional commit message
4. Commit with generated or provided message
5. Report commit hash and summary

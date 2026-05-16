---
description: Stage changes and create a conventional commit
inclusion: manual
argument-hint: "[type] [message]"
---

## Arguments
TYPE: $1 (default: auto-detect)
MESSAGE: $2 (default: auto-generate)

## Workflow
1. Stage relevant files (avoid unrelated changes)
2. Generate conventional commit message (feat, fix, chore, etc.)
3. Verify no secrets or env files are staged
4. Create commit

---
description: Stage and commit changes with conventional commit message
inclusion: manual
argument-hint: "[commit-message]"
---

## Arguments
MESSAGE: $1 (optional, auto-generated if not provided)

## Workflow
1. Review staged changes with `git diff --staged`
2. If no message provided, generate from changes
3. Validate conventional commit format
4. Scan for secrets or credentials
5. Commit with message

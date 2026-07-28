---
description: Create a conventional commit with staged changes
inclusion: manual
argument-hint: "[type] [message]"
---

## Arguments
TYPE: $1 (default: feat, options: feat, fix, data, model, pipeline, docs, test, refactor)
MESSAGE: $2 (required, commit description)

## Workflow
1. Check staged files with `git status`
2. Verify no secrets in staged files
3. Run lint on staged Python files
4. Create commit: `git commit -m "$TYPE: $MESSAGE"`
5. Report commit hash and changed files


---
description: Create a new feature or fix branch with proper naming
inclusion: manual
argument-hint: "[type] [description]"
---

## Arguments
TYPE: $1 (default: feature, options: feature, fix, refactor, chore)
DESC: $2 (required, short description in kebab-case)

## Workflow
1. Ensure working tree is clean (stash if needed)
2. Pull latest from main/develop
3. Create branch with format: `$1/$2`
4. Switch to new branch
5. Report branch name and base commit

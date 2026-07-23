---
description: Create a new feature or fix branch with proper naming
inclusion: manual
argument-hint: "[type] [description]"
---

## Arguments
TYPE: $1 (default: feature, options: feature, fix, hotfix, chore)
DESCRIPTION: $2 (required, branch description in kebab-case)

## Workflow
1. Ensure working tree is clean
2. Fetch latest from remote
3. Create branch from latest main: `$1/$2`
4. Switch to new branch
5. Report branch name and base commit

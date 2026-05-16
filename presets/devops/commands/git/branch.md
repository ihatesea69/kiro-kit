---
description: Create a new branch following naming conventions
inclusion: manual
argument-hint: "[branch-type] [description]"
---

## Arguments
TYPE: $1 (required, options: feature, fix, chore, infra)
DESCRIPTION: $2 (required)

## Workflow
1. Ensure working tree is clean
2. Pull latest from main
3. Create branch: `$1/$2` (kebab-case description)
4. Switch to new branch
5. Report branch name

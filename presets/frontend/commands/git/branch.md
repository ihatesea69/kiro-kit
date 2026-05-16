---
description: Create and switch to a new feature branch
inclusion: manual
argument-hint: "[branch-name]"
---

## Arguments
BRANCH: $1 (required)

## Workflow
1. Fetch latest from remote
2. Create branch from main: `git checkout -b $1`
3. Push branch to remote with tracking
4. Report branch creation

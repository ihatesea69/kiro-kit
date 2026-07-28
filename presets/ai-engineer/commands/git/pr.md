---
description: Create a pull request with conventional format
inclusion: manual
argument-hint: "[branch] [from-branch]"
---

## Arguments
TO_BRANCH: $1 (default: main)
FROM_BRANCH: $2 (default: current branch)

## Workflow
1. Verify all tests pass on current branch
2. Push current branch to remote
3. Create PR with `gh pr create`
4. Include summary of changes, test results, and metrics
5. Add appropriate labels (data, ml, pipeline, etc.)


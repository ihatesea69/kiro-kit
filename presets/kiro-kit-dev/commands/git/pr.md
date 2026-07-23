---
description: Create a pull request with proper description
inclusion: manual
argument-hint: "[target-branch] [from-branch]"
---

## Arguments
TO_BRANCH: $1 (default: main)
FROM_BRANCH: $2 (default: current branch)

## Workflow
1. Verify all tests pass on current branch
2. Generate PR title from recent commits
3. Create PR description with changes summary
4. Include test results and verification notes
5. Create PR using `gh pr create`

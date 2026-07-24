---
description: Create a pull request with proper description
inclusion: manual
argument-hint: "[target-branch] [source-branch]"
---

## Arguments
TARGET: $1 (default: main)
SOURCE: $2 (default: current branch)

## Workflow
1. Verify branch is up to date with target
2. Generate PR title from recent commits
3. Create PR description with summary of changes
4. Include testing notes and any blocked features
5. Create PR using `gh pr create`

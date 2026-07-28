---
description: Create a new feature branch with naming convention
inclusion: manual
argument-hint: "[type] [description]"
---

## Arguments
TYPE: $1 (default: feature, options: feature, experiment, data, fix, pipeline)
DESC: $2 (required, branch description in kebab-case)

## Workflow
1. Fetch latest from remote
2. Create branch: `git checkout -b $TYPE/$DESC`
3. Push branch to set upstream
4. Report branch name and base commit


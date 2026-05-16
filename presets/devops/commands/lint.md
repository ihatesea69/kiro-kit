---
description: Run linting and validation checks across the project
inclusion: manual
---

## Workflow
1. Run ESLint on source files if applicable
2. Run `terraform fmt -check` on .tf files
3. Run `terraform validate` on infrastructure code
4. Run `hadolint` on Dockerfiles
5. Run `helm lint` on Helm charts if present
6. Report results with error counts and fix suggestions
7. If `--fix` flag passed, auto-fix what is possible

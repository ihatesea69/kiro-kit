---
description: Review code changes for correctness, performance, and best practices
inclusion: manual
argument-hint: "[file-or-branch]"
---

## Arguments
TARGET: $1 (default: staged changes, or specific file/branch)

## Workflow
1. Identify changed files (git diff or specified target)
2. Review for correctness (logic errors, edge cases)
3. Check data handling (leakage, validation, types)
4. Verify test coverage for changes
5. Check for security issues (credentials, injection)
6. Report findings with severity levels


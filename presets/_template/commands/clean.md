---
description: Clean build artifacts, caches, and temporary files
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: all)

## Workflow
1. Remove build output directories (dist, build, .next, etc.)
2. Clear package manager caches if scope includes deps
3. Remove coverage reports and test artifacts
4. Report cleaned paths

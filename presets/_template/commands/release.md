---
description: Prepare and execute a release
inclusion: manual
argument-hint: "[version]"
---

## Arguments
VERSION: $1 (default: patch)

## Workflow
1. Verify working tree is clean
2. Run full test suite
3. Bump version (patch, minor, major, or explicit semver)
4. Update CHANGELOG.md with release notes
5. Create git tag
6. Push tag to trigger CI publish

---
description: Prepare and execute a release with version bump and changelog
inclusion: manual
argument-hint: "[version-type]"
---

## Arguments
VERSION_TYPE: $1 (default: patch, options: major, minor, patch)

## Workflow
1. Verify working tree is clean
2. Run full test suite
3. Bump version in package.json
4. Update CHANGELOG.md with new entries
5. Create git commit and tag
6. Push to remote with tags
7. Report release summary

---
description: Prepare a release build with version bumping and changelog
inclusion: manual
argument-hint: "[version-type]"
---

## Arguments
VERSION: $1 (default: patch, options: major, minor, patch, custom)

## Workflow
1. Bump version in pubspec.yaml or package.json
2. Update build number (auto-increment)
3. Generate changelog entry from recent commits
4. Run full test suite to verify
5. Create release build for target platforms
6. Tag the release in git
7. Report build artifacts and next steps (store submission)

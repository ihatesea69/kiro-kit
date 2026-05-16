---
description: Prepare a release with version bump, changelog, and package build
inclusion: manual
argument-hint: "[version-bump]"
---

## Arguments
BUMP: $1 (default: patch, options: major, minor, patch)

## Workflow
1. Run full test suite and verify all pass
2. Bump version in `pyproject.toml` or `setup.cfg`
3. Update CHANGELOG.md with new version section
4. Build package with `python -m build`
5. Verify package with `twine check dist/*`
6. Create git tag and commit


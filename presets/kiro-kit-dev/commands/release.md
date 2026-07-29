---
description: Prepare a Kiro-Kit release — version bump, changelog, tag; CI publishes
inclusion: manual
argument-hint: "[version-type]"
---

## Arguments
VERSION_TYPE: $1 (default: patch, options: major, minor, patch)

## Workflow
1. Verify the working tree is clean and the branch is up to date with `main`
2. Run the full suite: `cd packages/cli && npx vitest run`, then the structural
   config, then `cd scripts/parity-sync && npx vitest run`
3. Bump `version` in `packages/cli/package.json` per semver — patch for fixes
   and content updates, minor for new presets, commands, or threshold changes,
   major for CLI or manifest schema breaks
4. Add a `CHANGELOG.md` entry describing what changed for the person hitting the
   bug, not for the commit log
5. Commit and open a pull request; wait for CI (lint, typecheck, tests, build,
   and the cross-platform smoke test) to pass
6. Merge to `main`, then tag and push:
   `git tag -a v<version> -m "..." && git push origin v<version>`
7. Watch the publish workflow, then confirm on npm: `npm view kiro-kit version`
8. Create the GitHub release at the tag, reusing the CHANGELOG entry

## Do not
- Do not run `npm publish` by hand. CI publishes with provenance through an OIDC
  trusted publisher; a manual publish skips that and has already shipped one
  stale artefact that had to be deprecated.
- Do not tag before merging. The workflow runs from the tagged commit, so a tag
  on an older commit runs that commit's workflow, not the current one.
- Do not rename `.github/workflows/publish.yml`. npm pins the filename in the
  trusted publisher configuration.

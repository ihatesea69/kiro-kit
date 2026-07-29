---
inclusion: always
description: Development workflow for KK-Kiro-Kit repository — build, test, version, commit, push, publish
---

# KK-Kiro-Kit Development Workflow

## Repository Layout

- `packages/cli/` — npm package `kiro-kit` (TypeScript, ESM, tsup bundler)
- `presets/{frontend,backend,fullstack,mobile,devops,data-ai,ai-engineer,sa,kiro-kit-dev}/`
  — 9 self-contained preset directories
- `presets/_template/` — skeleton for generating new presets (not published)
- `apps/docs/` — the documentation site; its `/docs/reference` section is
  generated from preset manifests and gitignored, never hand-edited
- `scripts/parity-sync/` — dormant maintainer tool from a completed one-off
  migration; leave it alone unless that migration is being repeated
- `docs/` — project documentation

## Build

```bash
cd packages/cli && npx tsup
```

This bundles `src/` into `dist/` and copies `presets/` into `dist/presets/`.

## Test

```bash
# Unit + e2e + property tests (CLI package)
cd packages/cli && npx vitest run

# Structural tests (preset thresholds, manifest validation)
cd packages/cli && npx vitest run --config vitest.structural.config.ts

# Parity-sync tool tests
cd scripts/parity-sync && npx vitest run
```

## Version Bump

Edit `packages/cli/package.json` field `"version"`. Follow semver:
- patch: bug fixes, content updates within presets
- minor: new commands, new skills, threshold changes
- major: CLI breaking changes, manifest schema changes

## Commit Convention

Use conventional commits:
```
feat(preset): add new skill X to frontend preset
fix(cli): handle undefined presets in MetadataWriter
docs: update README with new counts
chore: bump version to 0.2.4
```

## Release Checklist

Releases are published by CI. **Do not run `npm publish` by hand** — a manual
publish skips provenance and repeats the failure described below.

1. Make changes to `presets/` or `packages/cli/src/` on a branch
2. Bump the version in `packages/cli/package.json`
3. Add a `CHANGELOG.md` entry written for the person hitting the bug
4. Open a pull request; CI runs lint, typecheck, tests, build, and a smoke test
   that installs the packed tarball on Linux and macOS
5. Merge to `main`
6. Tag and push: `git tag -a v<version> -m "..." && git push origin v<version>`

The publish workflow then verifies the tag matches `packages/cli/package.json`,
skips if that version is already on npm, and publishes with provenance using an
OIDC identity — there is no npm token in the repository.

### Why it works this way

`npm publish` packs whatever sits in `dist/`. Publishing 0.10.3 by hand shipped
a `dist/` that was two months old: seven presets instead of ten, none of the
fixes that release was named for, and 41 stray files. It had to be deprecated.

Two guards exist now, and both matter:

- `packages/cli` runs `prepublishOnly: clean && build`, so a stale `dist/`
  cannot be published even by hand
- The workflow refuses to publish when the tag and `package.json` disagree

### Do not rename `publish.yml`

npm pins the workflow filename in the trusted publisher configuration. Renaming
the file breaks releases until the configuration on npmjs.com is updated to
match, and npm does not validate that configuration until a publish is
attempted.

## After Changes to Presets

When modifying preset content (agents, skills, commands, hooks, workflows, steering):
- Update `manifest.json` of affected preset if adding/removing files
- Ensure no orphan files (every file in preset dir must be in manifest, except `manifest.json`, `README.md`, `.gitkeep`)
- Run structural tests to verify thresholds still pass
- No emoji in any `.md` or `.json` file
- No real PII (use placeholders like `[email]`, `[name]`)

## Key Constraints

- Never modify `packages/cli/src/` for content-only changes
- Each preset is self-contained (no shared core, no cross-preset references)
- Hooks must have `.js` file; `.sh` and `.ps1` are optional fallbacks
- Steering files need YAML front-matter with `inclusion` and `description`
- Agent files need YAML front-matter with `name` and `description`
- Command files need YAML front-matter with `description`

## npm Publish Note

Publishing requires OTP from authenticator app. The agent cannot do this automatically. After push + tag, run manually:
```bash
cd packages/cli && npm publish --access public --otp=<YOUR_OTP>
```

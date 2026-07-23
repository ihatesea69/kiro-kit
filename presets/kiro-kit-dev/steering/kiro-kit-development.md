---
inclusion: always
description: Development workflow for KK-Kiro-Kit repository — build, test, version, commit, push, publish
---

# KK-Kiro-Kit Development Workflow

## Repository Layout

- `packages/cli/` — npm package `kiro-kit` (TypeScript, ESM, tsup bundler)
- `presets/{frontend,backend,fullstack,mobile,devops,data-ai}/` — 6 self-contained preset directories
- `presets/_template/` — skeleton for generating new presets (not published)
- `scripts/parity-sync/` — maintainer tool for syncing content from reference kit
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

1. Make changes to `presets/` or `packages/cli/src/`
2. Build: `cd packages/cli && npx tsup`
3. Run tests to verify nothing broke
4. Bump version in `packages/cli/package.json`
5. Update `CHANGELOG.md` with changes
6. Commit: `git add -A && git commit -m "feat: description"`
7. Tag: `git tag v<version>`
8. Push: `git push origin main --tags`
9. Publish (manual, needs OTP): `cd packages/cli && npm publish --access public`
10. Install globally to verify: `npm install -g kiro-kit@latest`

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

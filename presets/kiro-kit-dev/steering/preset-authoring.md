---
inclusion: always
description: How to author a Kiro-Kit preset — manifest schema, the strict no-orphan invariant, artifact types, and the structural thresholds every preset must meet.
---

# Preset Authoring

A preset is a self-contained directory under `presets/<name>/` that `kiro-kit`
copies into a user's `.kiro/` workspace. `manifest.json` is the single source of
truth.

## Manifest schema (`packages/cli/src/core/ManifestParser.ts`)

Required fields: `name`, `version`, `description`, `category` (must be in
`PresetNameSchema`), and `files` (non-empty). Optional: `dependencies`,
`mcpServers`, `hooks`, `tags`, `minCounts`.

Each `files[]` entry: `{ source, target, type, executable? }` where `type` is one
of: `steering | hook | mcp | skill | agent | command | workflow | statusline |
metadata | settings | env | spec | docs | doc | config | powers | other`.

## The no-orphan invariant (critical)

`ManifestParser.validate()` enforces **two** rules, and the structural tests fail
the build if either breaks:

1. **Completeness** — every `source` declared in the manifest must exist on disk.
2. **No orphan** — every file on disk (except `manifest.json` and `README.md`)
   MUST be declared in `manifest.files`.

So: whenever you add or remove a file in a preset, update the manifest. Use
`scripts/sync-preset-manifests.mjs` (declares undeclared files) and
`scripts/prune-manifest-broken-links.mjs` (removes declarations for missing
files) to reconcile automatically.

## Structural thresholds (`tests/structural/preset-thresholds.test.ts`)

Every shipped preset must have: **≥16 agents**, **≥22 skills**, **≥40 commands**,
**≥6 hooks** (counted as `.js` files), **≥4 workflows**. The fastest way to hit
these is to base a new preset on an existing one (e.g. copy `backend`) and then
respecialize `steering/`, `specs/`, `powers.json`, and the README.

## Wiring a new preset name

Adding a 7th+ preset means touching more than the directory:

- Add the name to `PresetNameSchema` in `ManifestParser.ts`.
- Add it to `PRESET_SERVERS` in `MCPConfigurator.ts`.
- Add it to every hardcoded `PRESETS` array in `tests/**` (grep for `'frontend', 'backend'`).
- Add a `powers.json` and a per-preset row in the main README.

`PresetLoader.listAvailable()` auto-discovers preset directories (skipping names
starting with `_`), so no registration is needed there.

## Verify

`pnpm typecheck && pnpm build && pnpm test:structural`, then
`kiro-kit init --preset <name> --yes` into a temp dir and `kiro-kit doctor`.

Also add it to the `PRESETS` array in `scripts/sync-preset-manifests.mjs` and
run that script, or the new preset's files become orphans and the no-orphan
test fails.

## Contributing one upstream

A preset is a few hundred files. Open a **preset request** issue before writing
it, so the overlap question gets settled first — `GOVERNANCE.md` states the bar:
it must meet the thresholds above, ship at least one complete worked example
spec, and cover a stack the existing nine do not. Finding out afterwards that it
duplicates `fullstack` is an expensive way to spend a weekend.

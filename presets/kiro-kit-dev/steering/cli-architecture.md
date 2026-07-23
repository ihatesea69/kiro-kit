---
inclusion: always
description: Kiro-Kit CLI architecture — core modules, the install pipeline, and the three invariants (bundled-not-fetched, user-priority merge, atomic writes).
---

# CLI Architecture

The `kiro-kit` CLI lives in `packages/cli/` (TypeScript, ESM, bundled with tsup).

## Layering

- `src/index.ts` — entry point; registers every command on the Commander program.
- `src/commands/*` — one file per command (`init`, `add`, `update`, `restore`,
  `doctor`, `spec`, `powers`, `list`, `info`, `telemetry`). `init.ts` is the only
  file allowed to import from both `core/*` and `ui/*`.
- `src/core/*` — business logic: `PresetLoader`, `ManifestParser`, `ConflictResolver`,
  `BackupManager`, `TrackingStore`, `MetadataWriter`, `MCPConfigurator`,
  `PowerInstaller`, `merge/*`.
- `src/ui/*` — presentation only (theme, screens, prompts, task runner).
- `src/utils/*` — `fs-safe` (atomicWrite), `paths` (safePathInside), logger, color.

## Three invariants (never violate)

1. **Bundled, not fetched** — all presets ship in the npm tarball (copied into
   `dist/presets` by the tsup build). The CLI works offline; it never downloads
   preset content at install time. (The `powers install` command is the sole
   exception — it clones official power repos, and only from a hardcoded allowlist.)
2. **User-priority merge** — existing user files are never silently overwritten.
   `ConflictResolver` decides per file (WRITE_NEW / OVERWRITE_WITH_BACKUP / SKIP /
   NO_OP); conflicts prompt in interactive mode.
3. **Atomic writes** — every write goes through `utils/fs-safe.atomicWrite`
   (temp file + rename) so a crash never leaves a partial file. Tracking and
   metadata writes use it too.

## Path safety

All install writes must pass `utils/paths.safePathInside(workspaceRoot, target)`
before writing, so a malicious manifest target (`..`, absolute) can never escape
the workspace. `restore` validates the backup timestamp; `spec new --from`
validates the template name.

## Line endings

`atomicWrite` normalizes `.json/.yaml/.yml` to LF and everything else to `os.EOL`.
`ConflictResolver` hashes content with line endings normalized, so a CRLF-on-disk
file compares equal to its LF source (keeps re-`init` idempotent on Windows).

# Requirements Document

## Introduction

A kiro-kit contributor wants to ship a new preset — a self-contained directory of agents, skills, commands, hooks, workflows, steering files, statusline scripts, and metadata that the `kiro-kit init` command can install into a Kiro IDE workspace. Adding a preset touches several layers of the monorepo: the preset directory itself, the schema validator (`ManifestParser.ts`), the MCP configurator (`MCPConfigurator.ts`), the reconcile scripts, and the structural test suite. This spec documents every step required to bring a new preset from zero to a passing CI run and a successful local install.

## Glossary

- **Preset** — a directory under `presets/<name>/` that bundles opinionated Kiro IDE configuration for a specific engineering domain.
- **manifest.json** — the source-of-truth file inside each preset; declares every file the preset will install, its metadata, MCP server definitions, hook registrations, and minimum artifact counts.
- **No-orphan invariant** — the rule enforced by `ManifestParser.validate()` (error code KK013) that every file under a preset directory (excluding `manifest.json` and `README.md`) must be declared in `manifest.files[].source`.
- **File-completeness invariant** — the rule (KK012) that every path in `manifest.files[].source` must exist on disk.
- **PresetNameSchema** — the Zod enum in `packages/cli/src/core/ManifestParser.ts` that gates which preset names are schema-valid.
- **PRESET_SERVERS** — the constant in `packages/cli/src/core/MCPConfigurator.ts` mapping preset names to their default and optional MCP server lists.
- **Structural test** — `packages/cli/tests/structural/preset-thresholds.test.ts`, which asserts each preset in its hardcoded `PRESETS` array meets minimum artifact counts.
- **Powers** — the `powers.json` file in each preset that lists Kiro Powers extensions to auto-install; managed by `kiro-kit powers install`.
- **sync-preset-manifests.mjs** — the idempotent reconcile script at `scripts/sync-preset-manifests.mjs` that appends missing file declarations to `manifest.json` for each preset in its hardcoded `PRESETS` array.
- **Threshold** — the minimum artifact count validated by the structural test: >= 16 agents (`.md` files under `agents/`), >= 22 skill folders (folders containing `SKILL.md`), >= 40 commands (`.md` files under `commands/`), >= 6 hooks (`.js` files under `hooks/`), >= 4 workflows (`.md` files under `workflows/`).

## Out of Scope

- Modifying the `init` command's TaskRunner logic or ConflictResolver behavior.
- Changing how `PresetLoader.listAvailable()` auto-discovers presets (it already filters `_`-prefixed directories and directories without `manifest.json`).
- Publishing the preset to npm or any package registry.
- Changes to the `kiro-kit powers` command internals.

## Requirements

### Requirement 1: Preset Directory Scaffolded from Template

**User Story:** As a kiro-kit contributor, I want to copy the `presets/_template` directory to `presets/<name>` and customize it, so that the new preset starts with the correct directory layout and placeholder files.

#### Acceptance Criteria

1. WHEN the contributor copies `presets/_template` to `presets/<name>` THE SYSTEM SHALL produce a directory containing at minimum: `manifest.json`, `README.md`, `agents/`, `skills/`, `commands/`, `hooks/`, `workflows/`, `steering/`, `statusline.js`, `statusline.sh`, `statusline.ps1`, `settings.json`, and `.mcp.json.example`.
2. WHEN the contributor runs `node scripts/sync-preset-manifests.mjs` after adding files THE SYSTEM SHALL detect any file present on disk but absent from `manifest.files` and append the missing declarations, leaving existing declarations untouched.
3. IF the preset directory name starts with an underscore (`_`) THEN `PresetLoader.listAvailable()` SHALL exclude it from the list of available presets, so template directories are never exposed to end users.

### Requirement 2: manifest.json Passes Schema Validation and Both Invariants

**User Story:** As a kiro-kit contributor, I want the preset's `manifest.json` to be valid against `ManifestSchema` and to satisfy the file-completeness and no-orphan invariants, so that `kiro-kit init` can load and install the preset without errors.

#### Acceptance Criteria

1. WHEN `ManifestParser.parse(manifestJsonString)` is called with the new preset's `manifest.json` THE SYSTEM SHALL return `{ ok: true, value: Manifest }` with no Zod validation errors.
2. WHEN `ManifestParser.validate(manifest, presetDir)` is called THE SYSTEM SHALL return `{ ok: true }`, meaning every path in `manifest.files[].source` exists on disk and every file on disk (excluding `manifest.json` and `README.md`) is declared in `manifest.files`.
3. IF any file is present on disk but absent from `manifest.files` THEN `ManifestParser.validate()` SHALL return `{ ok: false, error: [{ code: 'KK013', ... }] }` identifying each orphan path.
4. WHEN the manifest's `category` field is set to the new preset name THE SYSTEM SHALL pass `PresetNameSchema` validation only after the name is added to the Zod enum in `ManifestParser.ts` (Requirement 3).

### Requirement 3: PresetNameSchema Updated in ManifestParser.ts

**User Story:** As a kiro-kit contributor, I want to add the new preset name to the `PresetNameSchema` Zod enum, so that `ManifestSchema.category` accepts the new name without a validation error.

#### Acceptance Criteria

1. WHEN the contributor adds the new preset name as a string literal to the `PresetNameSchema` array in `packages/cli/src/core/ManifestParser.ts` THE SYSTEM SHALL accept that name as a valid `category` value in all subsequent `ManifestParser.parse()` calls.
2. WHEN `pnpm -r typecheck` is run after the change THE SYSTEM SHALL complete with zero TypeScript errors.
3. IF the new name is omitted from `PresetNameSchema` THEN `ManifestParser.parse()` SHALL return `{ ok: false, error: { code: 'KK011', message: '...category: Invalid enum value...' } }` for any manifest that references that name.

### Requirement 4: PRESET_SERVERS and Reconcile Script Updated

**User Story:** As a kiro-kit contributor, I want to add the new preset to `PRESET_SERVERS` in `MCPConfigurator.ts` and to the `PRESETS` array in `sync-preset-manifests.mjs`, so that `kiro-kit init` generates correct `.mcp.json` output and the reconcile script covers the new preset.

#### Acceptance Criteria

1. WHEN an entry is added to `PRESET_SERVERS` in `packages/cli/src/core/MCPConfigurator.ts` with the new preset name as key and `{ default: string[], optional: string[] }` values drawn from `SERVER_DEFINITIONS` THE SYSTEM SHALL call `getMCPConfig('<name>')` and return a non-empty `MCPPresetConfig.servers` object.
2. WHEN the new preset name is appended to the `PRESETS` array in `scripts/sync-preset-manifests.mjs` THE SYSTEM SHALL process the new preset directory on the next `node scripts/sync-preset-manifests.mjs` invocation, logging any missing declarations.
3. WHEN `pnpm -r build` is run after updating `MCPConfigurator.ts` THE SYSTEM SHALL complete with zero TypeScript compiler errors.

### Requirement 5: Structural Test PRESETS Array Updated and Thresholds Met

**User Story:** As a kiro-kit contributor, I want the new preset name added to the hardcoded `PRESETS` array in `preset-thresholds.test.ts` and the preset to meet all minimum artifact counts, so that the structural test suite covers the new preset and passes without modification.

#### Acceptance Criteria

1. WHEN the new preset name is added to the `PRESETS` array in `packages/cli/tests/structural/preset-thresholds.test.ts` THE SYSTEM SHALL generate a `describe` block for the new preset and assert all five threshold checks.
2. WHEN `pnpm test -- tests/structural/preset-thresholds.test.ts` is run THE SYSTEM SHALL pass all five threshold assertions for the new preset: `countMdFiles(agentsDir) >= 16`, `countSkillFolders(skillsDir) >= 22`, `countMdFiles(commandsDir) >= 40`, `countHookSets(hooksDir) >= 6`, `countWorkflows(workflowsDir) >= 4`.
3. IF any threshold is not met THE SYSTEM SHALL report the failing assertion with the actual count, e.g., `Error: expected 12 to be >= 16`.
4. WHEN `pnpm test` is run (full suite) THE SYSTEM SHALL pass all unit, property, and structural tests with no regressions.

### Requirement 6: Powers File Present and Install Verified End-to-End

**User Story:** As a kiro-kit contributor, I want the preset to include a `powers.json` file listing relevant Kiro Powers extensions, and I want a successful local install to confirm all artifacts land in the workspace, so that the preset is usable by end users.

#### Acceptance Criteria

1. WHEN a `powers.json` file is added to `presets/<name>/` and declared in `manifest.json` with `type: "powers"` THE SYSTEM SHALL include it in the file list returned by `PresetLoader.load('<name>')`.
2. WHEN `kiro-kit init --preset <name> --yes` is run in an empty temporary workspace THE SYSTEM SHALL exit with code 0 and create `.kiro/` directories containing agents, skills, commands, hooks, workflows, and steering files matching the manifest entries.
3. WHEN `kiro-kit doctor` is run in the initialized workspace THE SYSTEM SHALL report no errors and at most the expected warnings (credential placeholders in `.env.example`).
4. WHEN the README.md in the repository root is updated to include the new preset in the presets table THE SYSTEM SHALL reflect the new preset's name, category, and description.

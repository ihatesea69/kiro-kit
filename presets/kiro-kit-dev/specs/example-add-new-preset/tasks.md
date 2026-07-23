# Implementation Plan: Add a New Preset

## Overview

The plan proceeds in strict dependency order: scaffold the directory first so there is something on disk to validate against, then satisfy the schema layer (ManifestParser, MCPConfigurator), then the test and tooling layer (structural test PRESETS array, sync script), and finally verify the full chain end-to-end. All tasks are self-contained commits. Artifact authoring (agents, skills, commands, hooks, workflows) is parallelizable once the directory exists.

## Tasks

- [ ] 1. Scaffold preset directory from `presets/_template`
  - [ ] 1.1 Copy `presets/_template` to `presets/<name>` using `cp -r presets/_template presets/<name>` (or the platform equivalent)
  - [ ] 1.2 Remove the `.gitkeep` placeholder files from `agents/`, `docs/`, and `steering/` — they exist only to commit empty directories in the template
  - [ ] 1.3 Edit `presets/<name>/manifest.json`: set `name`, `description`, `version`, and `category` to the correct values; leave `files[]` as the template entries for now (the sync script will append missing ones)
  - [ ] 1.4 Edit `presets/<name>/README.md` to describe the new preset's purpose, target audience, and the engineering domain it addresses
  - _Requirements: R1.1_

- [ ] 2. Author agents (minimum 16)
  - [ ] 2.1 Create at minimum 16 agent `.md` files under `presets/<name>/agents/`, each with valid YAML front-matter containing `name` (kebab-case), `description`, and an appropriate `inclusion` value (`manual`, `always`, or `fileMatch`)
  - [ ] 2.2 Confirm `packages/cli/tests/structural/preset-thresholds.test.ts::countMdFiles(agentsDir)` returns >= 16 by dry-running: `ls presets/<name>/agents/*.md | wc -l`
  - _Requirements: R5.1, R5.2_

- [ ] 3. Author skills (minimum 22 folders)
  - [ ] 3.1 Create at minimum 22 skill folders under `presets/<name>/skills/<skill-name>/`, each containing a `SKILL.md` with front-matter (`name`, `description`)
  - [ ] 3.2 Optionally add `references/`, `scripts/`, and `assets/` subdirectories inside individual skill folders for reference material
  - [ ] 3.3 Confirm `countSkillFolders(skillsDir)` >= 22 by counting directories that contain `SKILL.md`
  - _Requirements: R5.1, R5.2_

- [ ] 4. Author commands (minimum 40 `.md` files)
  - [ ] 4.1 Create at minimum 40 command template `.md` files under `presets/<name>/commands/` (nesting up to 3 levels is allowed, e.g., `commands/git/pr.md`)
  - [ ] 4.2 Each command file must have YAML front-matter with at minimum a `description` field
  - [ ] 4.3 Confirm `countMdFiles(commandsDir)` >= 40
  - _Requirements: R5.1, R5.2_

- [ ] 5. Author hooks (minimum 6 `.js` files)
  - [ ] 5.1 Create at minimum 6 hook `.js` files under `presets/<name>/hooks/`, each starting with the shebang `#!/usr/bin/env node`
  - [ ] 5.2 For each hook, add a cross-platform pair: a `.sh` file (marked `executable: true` in the manifest) and a `.ps1` file, mirroring the pattern in `presets/_template/hooks/`
  - [ ] 5.3 Add `presets/<name>/hooks/README.md` documenting all hooks and their trigger conditions
  - [ ] 5.4 Add `presets/<name>/hooks/.env.example` with any required environment variables as placeholders (no real credentials)
  - [ ] 5.5 Confirm `countHookSets(hooksDir)` >= 6 by counting `*.js` files under `hooks/`
  - _Requirements: R5.1, R5.2_

- [ ] 6. Author workflows (minimum 4) and steering files
  - [ ] 6.1 Create at minimum 4 workflow `.md` files under `presets/<name>/workflows/`
  - [ ] 6.2 Create context-aware steering files under `presets/<name>/steering/`, each with front-matter including `inclusion` and `description` (and `fileMatchPattern` when `inclusion: fileMatch`)
  - [ ] 6.3 Confirm `countWorkflows(workflowsDir)` >= 4
  - _Requirements: R5.1, R5.2_

- [ ] 7. Add `powers.json` and supporting config files
  - [ ] 7.1 Create `presets/<name>/powers.json` listing Kiro Powers extensions relevant to the new preset's domain
  - [ ] 7.2 Verify `presets/<name>/statusline.js`, `statusline.sh`, and `statusline.ps1` are present (copied from template); update their content to reflect the new preset name if the template uses a placeholder
  - [ ] 7.3 Verify `presets/<name>/settings.json` and `presets/<name>/.mcp.json.example` are present
  - [ ] 7.4 Add `presets/<name>/.env.example` at the preset root listing all credential variables referenced by `.mcp.json.example`
  - _Requirements: R6.1_

- [ ] 8. Synchronize `manifest.json` using the reconcile script
  - [ ] 8.1 Run `node scripts/sync-preset-manifests.mjs` from the repository root; inspect console output for the new preset entry listing appended declarations
  - [ ] 8.2 Review each appended `FileEntry` in `manifest.json` — verify the inferred `type` is correct for every path (the script uses top-level directory name to infer type; override manually where the inference is wrong)
  - [ ] 8.3 Run `node scripts/sync-preset-manifests.mjs` a second time and confirm the output shows `[<name>] already in sync (<N> files)` — proving idempotency
  - _Requirements: R1.2, R2.1, R2.2_

- [ ] 9. Add preset name to `PresetNameSchema` in `ManifestParser.ts`
  - [ ] 9.1 Open `packages/cli/src/core/ManifestParser.ts`; locate the `PresetNameSchema` constant (line 13); append the new preset name as a string literal in the `z.enum([...])` array
  - [ ] 9.2 Run `pnpm -r typecheck` and confirm zero TypeScript errors
  - [ ] 9.3 Run `pnpm test -- tests/unit/manifest-parser` and confirm all existing manifest-parser tests still pass
  - _Requirements: R3.1, R3.2, R3.3_

- [ ] 10. Add preset to `PRESET_SERVERS` in `MCPConfigurator.ts`
  - [ ] 10.1 Open `packages/cli/src/core/MCPConfigurator.ts`; locate the `PRESET_SERVERS` constant (line 99); add a new entry keyed on the preset name with `default` and `optional` arrays drawn from the keys of `SERVER_DEFINITIONS`
  - [ ] 10.2 Choose `default` servers that require no credentials (e.g., `'filesystem'`, `'git'`, `'fetch'`, `'memory'`) and `optional` servers that require credentials (e.g., `'github'`, `'sentry'`) appropriate to the preset's domain
  - [ ] 10.3 Run `pnpm -r typecheck` to confirm no TypeScript errors
  - _Requirements: R4.1, R4.3_

- [ ] 11. Add preset to `PRESETS` arrays in `preset-thresholds.test.ts` and `sync-preset-manifests.mjs`
  - [ ] 11.1 Open `packages/cli/tests/structural/preset-thresholds.test.ts`; append the new preset name to the `PRESETS` array on line 6
  - [ ] 11.2 Open `scripts/sync-preset-manifests.mjs`; append the new preset name to the `PRESETS` array on line 23
  - [ ] 11.3 Run `pnpm test -- tests/structural/preset-thresholds.test.ts` and confirm all five threshold assertions pass for the new preset
  - _Requirements: R5.1, R5.2, R5.3, R5.4_

- [ ] 12. End-to-end verification
  - [ ] 12.1 Run the full test suite: `pnpm test` — all unit, property, and structural tests must pass with zero regressions
  - [ ] 12.2 Build the CLI: `pnpm -r build` — must complete with zero errors
  - [ ] 12.3 Create a temporary workspace and run `kiro-kit init --preset <name> --yes`; confirm exit code 0 and that `.kiro/` is populated with agents, skills, commands, hooks, and workflows matching the manifest
  - [ ] 12.4 Run `kiro-kit doctor` in the initialized workspace; confirm no errors and that the only warnings are the expected credential-placeholder warnings from `.env.example`
  - [ ] 12.5 Run `kiro-kit list` and confirm the new preset appears with correct agent, skill, command, hook, workflow, and MCP server counts
  - _Requirements: R2.2, R5.4, R6.2, R6.3_

- [ ] 13. Update documentation
  - [ ] 13.1 Add a row for the new preset to the presets table in the repository root `README.md`, including name, category, one-line description, and agent/skill/command counts
  - [ ] 13.2 Review `docs/creating-presets.md` for any content that references a hardcoded list of presets and update it to include the new name if needed
  - _Requirements: R6.4_

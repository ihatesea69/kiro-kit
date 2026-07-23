# Requirements Document

## Introduction

Each kiro-kit preset ships with a library of worked example specs — fully authored `requirements.md`, `design.md`, and `tasks.md` triads under `presets/<preset>/specs/example-<name>/`. These examples teach users the Kiro spec format by demonstrating it in the context of the preset's domain. The Kiro IDE's Specs panel recognizes a spec folder by the presence of a `.config.kiro` JSON marker. The `scripts/register-example-specs.mjs` script is the single mechanism for both placing that marker and registering all spec files in the preset's `manifest.json`, preserving the no-orphan invariant. This spec covers the end-to-end process of authoring new example specs, making them visible in the Kiro Specs panel, and verifying that `kiro-kit install` delivers them to user workspaces.

## Glossary

- **Example spec** — a complete, worked Kiro spec (requirements + design + tasks) placed under `presets/<preset>/specs/example-<name>/` as a learning artifact for users of that preset.
- **Spec folder** — a directory containing at minimum `requirements.md`, `design.md`, and `tasks.md`; optionally `.config.kiro`.
- **`.config.kiro`** — a JSON file with keys `specId` (UUID v4), `workflowType` (`"requirements-first"`), and `specType` (`"feature"`). Its presence signals to the Kiro IDE that the folder is a managed spec and causes it to appear in the Specs panel.
- **`register-example-specs.mjs`** — the idempotent script at `scripts/register-example-specs.mjs` that, for every `presets/<preset>/specs/example-*/` directory: (1) writes a `.config.kiro` file if one is absent, and (2) appends declarations for every file in the folder to the preset's `manifest.json` with `type: "spec"`.
- **No-orphan invariant** — enforced by `ManifestParser.validate()` (error code KK013); every file under a preset directory (excluding `manifest.json` and `README.md`) must be declared in `manifest.files`.
- **`manifest.files`** — the `FileEntry[]` array in each preset's `manifest.json` that `kiro-kit init` reads to know which files to copy and where.
- **`kiro-kit doctor`** — the `kiro-kit doctor` command that validates an installed workspace; it checks that all manifest-declared files are present in the target location and that the workspace is free of known configuration errors.
- **EARS** — Easy Approach to Requirements Syntax; the structured requirement format using keywords `WHEN`, `THE SYSTEM SHALL`, `IF`, `THEN`, `WHILE`, `WHERE`.

## Out of Scope

- Changing the format of `.config.kiro` or the Kiro IDE's Specs panel behavior.
- Modifying `scripts/register-example-specs.mjs` itself (this spec is about using the script, not changing it).
- Adding `specs/_templates/` scaffold templates (covered by a separate domain).
- Changes to the `kiro-kit spec new` command.

## Requirements

### Requirement 1: Spec Documents Authored to Kiro House Style

**User Story:** As a kiro-kit preset author, I want to write `requirements.md`, `design.md`, and `tasks.md` under `presets/<preset>/specs/example-<name>/` that follow the Kiro house style, so that the example teaches users the correct format for their own specs.

#### Acceptance Criteria

1. WHEN the three spec documents are created under `presets/<preset>/specs/example-<name>/` THE SYSTEM SHALL have a `requirements.md` that contains the sections `# Requirements Document`, `## Introduction`, `## Glossary`, `## Out of Scope`, and `## Requirements` with at minimum five numbered `### Requirement N: <title>` subsections.
2. WHEN `requirements.md` is authored each `### Requirement N` subsection SHALL contain a `**User Story:**` statement in the form "As a [role], I want …, so that …" and an `#### Acceptance Criteria` block with at minimum two numbered criteria written in EARS syntax (`WHEN … THE SYSTEM SHALL …`, `IF … THEN …`, `WHILE …`, or `WHERE …`).
3. WHEN `design.md` is authored THE SYSTEM SHALL contain the sections `# Design: <Feature>`, `## Architecture` (with `### System Context` and `### Component Design`), at minimum one fenced Mermaid diagram, `## Data Models`, `## Files & Interfaces`, `## Error Handling`, and `## Testing Strategy`.
4. WHEN `tasks.md` is authored THE SYSTEM SHALL contain `# Implementation Plan: <Feature>`, `## Overview`, and `## Tasks` where each top-level task is a checkbox (`- [ ] N.`) with at minimum two sub-tasks and a trailing `- _Requirements: RN.M, …_` line citing the requirements it satisfies.
5. WHEN the spec content is reviewed THE SYSTEM SHALL reference real files, functions, and command names from the preset's domain — no `<placeholder>` strings shall remain in the final documents.

### Requirement 2: `.config.kiro` Marker Present in Every Example Spec Folder

**User Story:** As a Kiro IDE user who has initialized a workspace from a preset, I want to see the preset's example specs in the Kiro Specs panel, so that I can open and read them without leaving the IDE.

#### Acceptance Criteria

1. WHEN `node scripts/register-example-specs.mjs` is run from the repository root THE SYSTEM SHALL create a `.config.kiro` JSON file inside every `presets/<preset>/specs/example-<name>/` directory that does not already have one.
2. WHEN the `.config.kiro` file is created THE SYSTEM SHALL contain valid JSON with the keys `specId` (a UUID v4 string), `workflowType` (string `"requirements-first"`), and `specType` (string `"feature"`).
3. WHEN `node scripts/register-example-specs.mjs` is run a second time on a folder that already has `.config.kiro` THE SYSTEM SHALL leave the existing file unchanged (idempotency).
4. WHEN `kiro-kit init --preset <preset> --yes` is run THE SYSTEM SHALL install the `.config.kiro` files along with the spec documents into `.kiro/specs/example-<name>/` in the workspace, making the specs visible in the Kiro IDE Specs panel.

### Requirement 3: All Spec Files Declared in `manifest.json`

**User Story:** As a kiro-kit contributor, I want every file under a spec folder to be declared in the preset's `manifest.json` so that the no-orphan invariant holds and `kiro-kit init` delivers all spec files to user workspaces.

#### Acceptance Criteria

1. WHEN `node scripts/register-example-specs.mjs` is run THE SYSTEM SHALL append a `FileEntry` with `type: "spec"` and `target: ".kiro/specs/<name>/<file>"` for every file in each `example-*` folder that is not already declared in `manifest.files`.
2. WHEN `ManifestParser.validate(manifest, presetDir)` is called after running the script THE SYSTEM SHALL return `{ ok: true }`, meaning the no-orphan invariant holds for the spec files.
3. WHEN `node scripts/register-example-specs.mjs` is run a second time THE SYSTEM SHALL add zero new declarations (idempotency), confirming the script does not duplicate entries.
4. IF a spec file is added to an `example-<name>/` folder manually without running the script THEN `ManifestParser.validate()` SHALL return `{ ok: false, error: [{ code: 'KK013', ... }] }` identifying the undeclared file as an orphan.

### Requirement 4: Structural Tests and Doctor Remain Green

**User Story:** As a kiro-kit maintainer, I want adding new example specs to a preset to leave all structural tests and the `kiro-kit doctor` check passing, so that the CI pipeline stays green and the installed workspace is healthy.

#### Acceptance Criteria

1. WHEN `pnpm test -- tests/structural/preset-thresholds.test.ts` is run after adding example specs THE SYSTEM SHALL pass all five threshold assertions for every preset in the `PRESETS` array — the spec files do not contribute to agent, skill, command, hook, or workflow counts.
2. WHEN `pnpm test` (full suite) is run THE SYSTEM SHALL pass all unit, property, and structural tests with zero regressions.
3. WHEN `kiro-kit doctor` is run in a workspace initialized from the updated preset THE SYSTEM SHALL report no errors related to the spec files.

### Requirement 5: Installed Specs Verified End-to-End

**User Story:** As a kiro-kit contributor, I want to confirm that the spec files are actually installed into a workspace by `kiro-kit init`, so that users receive the example specs when they set up the preset.

#### Acceptance Criteria

1. WHEN `kiro-kit init --preset <preset> --yes` is run in an empty temporary workspace THE SYSTEM SHALL create `.kiro/specs/example-<name>/requirements.md`, `.kiro/specs/example-<name>/design.md`, `.kiro/specs/example-<name>/tasks.md`, and `.kiro/specs/example-<name>/.config.kiro` for every `example-<name>` in the preset.
2. WHEN the installed `.kiro/specs/example-<name>/.config.kiro` is read THE SYSTEM SHALL contain a valid UUID in the `specId` field, confirming the marker was installed correctly.
3. WHEN `kiro-kit list` is run THE SYSTEM SHALL include a `spec` file count in the artifact breakdown for the preset that equals the total number of spec files installed (requirements + design + tasks + .config.kiro multiplied by the number of example specs).

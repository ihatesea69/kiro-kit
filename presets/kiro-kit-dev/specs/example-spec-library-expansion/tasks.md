# Implementation Plan: Spec Library Expansion

## Overview

The plan authors the spec documents first (the human-intensive step), then runs the register script to generate the `.config.kiro` marker and patch `manifest.json`, and finishes with structural and install verification. The script step is non-negotiable before any commit — committing spec files without running the script leaves orphan files that fail `ManifestParser.validate()` and break the manifest-parser unit tests.

## Tasks

- [ ] 1. Choose the spec subject and plan the content
  - [ ] 1.1 Select a feature or workflow from the preset's domain that a new user would realistically want to build in their first week; the subject must be specific enough to produce concrete acceptance criteria and implementation tasks (e.g., "Add a REST endpoint" for backend, "Implement a product card component" for frontend)
  - [ ] 1.2 Name the spec folder using kebab-case prefixed with `example-`, e.g., `example-add-rest-endpoint`; confirm the name does not collide with any existing `example-*` folder in `presets/<preset>/specs/`
  - [ ] 1.3 Sketch a rough outline of the requirements (5–7 numbered requirements) and the major design components before writing — this prevents mid-draft restructuring
  - _Requirements: R1.1_

- [ ] 2. Create the spec folder and author `requirements.md`
  - [ ] 2.1 Create the directory `presets/<preset>/specs/example-<name>/`
  - [ ] 2.2 Create `presets/<preset>/specs/example-<name>/requirements.md` with the Kiro house-style sections: `# Requirements Document`, `## Introduction`, `## Glossary`, `## Out of Scope`, `## Requirements`
  - [ ] 2.3 Write at minimum 5 `### Requirement N: <title>` subsections; each must contain a `**User Story:**` line and an `#### Acceptance Criteria` block with at minimum 2 EARS-syntax criteria (`WHEN … THE SYSTEM SHALL …`, `IF … THEN …`, `WHILE …`, or `WHERE …`)
  - [ ] 2.4 Replace all `<placeholder>` strings with concrete names drawn from the preset's real domain — no generic variable names in the final document
  - [ ] 2.5 Include at minimum one non-functional acceptance criterion per requirements doc (e.g., "all structural tests pass", "no-orphan invariant holds", "build completes with zero errors")
  - _Requirements: R1.1, R1.2, R1.5_

- [ ] 3. Author `design.md`
  - [ ] 3.1 Create `presets/<preset>/specs/example-<name>/design.md` with sections: `# Design: <Feature>`, `## Architecture` (with `### System Context` and `### Component Design`), `## Data Models`, `## Files & Interfaces`, `## Error Handling`, `## Testing Strategy`
  - [ ] 3.2 Insert at minimum one fenced Mermaid diagram under `### Component Design` — a `flowchart`, `sequenceDiagram`, or `classDiagram` is acceptable; the diagram must represent the actual component relationships or data flow for the specified feature
  - [ ] 3.3 Under `## Data Models`, include the relevant TypeScript interfaces or JSON schemas that the implementation would use
  - [ ] 3.4 Under `## Files & Interfaces`, list every real file that the implementation would create or modify, with a one-line description for each
  - [ ] 3.5 Under `## Error Handling`, include a Markdown table with columns `Scenario`, `Trigger`, and `Resolution` covering at minimum three distinct error paths
  - [ ] 3.6 Under `## Testing Strategy`, describe unit, integration (if applicable), and end-to-end test approaches with concrete example test descriptions
  - [ ] 3.7 Ensure `design.md` cross-references every requirement from `requirements.md` — no requirement should be left without a corresponding design decision
  - _Requirements: R1.3, R1.5_

- [ ] 4. Author `tasks.md`
  - [ ] 4.1 Create `presets/<preset>/specs/example-<name>/tasks.md` with sections: `# Implementation Plan: <Feature>`, `## Overview` (2–3 sentences on build order and rationale), `## Tasks`
  - [ ] 4.2 Write top-level tasks as checkboxes `- [ ] N. <task title>` ordered by dependency — foundational types and data models before higher-level components, tests before documentation
  - [ ] 4.3 Each top-level task must have at minimum 2 numbered sub-tasks `- [ ] N.M <specific action>` that are concrete enough to implement without further clarification
  - [ ] 4.4 Each top-level task must end with a `- _Requirements: RN.M, …_` line citing the specific requirement numbers the task satisfies
  - [ ] 4.5 Include a near-final top-level task titled "End-to-end verification" that exercises the full install or run path
  - [ ] 4.6 The LAST top-level task must be titled "Update documentation" and cover any README, changelog, or inline comment updates needed after the implementation
  - [ ] 4.7 Optionally mark nice-to-have sub-tasks with an asterisk (`- [ ] * N.M`) to indicate they can be deferred without blocking subsequent tasks
  - _Requirements: R1.4, R1.5_

- [ ] 5. Run the register script and verify `manifest.json`
  - [ ] 5.1 Run `node scripts/register-example-specs.mjs` from the repository root; confirm the console output includes the new preset's name and lists the newly added declarations (4 entries per new spec: `requirements.md`, `design.md`, `tasks.md`, `.config.kiro`)
  - [ ] 5.2 Open `presets/<preset>/specs/example-<name>/.config.kiro` and confirm it contains valid JSON with `specId` (UUID v4 format), `workflowType: "requirements-first"`, and `specType: "feature"`
  - [ ] 5.3 Open `presets/<preset>/manifest.json` and confirm the four `FileEntry` objects for the new spec are present with `type: "spec"` and correct `source` and `target` paths
  - [ ] 5.4 Run `node scripts/register-example-specs.mjs` a second time and confirm the output is `Done. Added 0 .config.kiro marker(s) and 0 manifest declaration(s).` — proving idempotency
  - _Requirements: R2.1, R2.2, R2.3, R3.1, R3.3_

- [ ] 6. Validate the no-orphan and file-completeness invariants
  - [ ] 6.1 Run `pnpm test -- tests/unit/manifest-parser` and confirm all manifest-parser unit tests pass; these tests exercise `ManifestParser.validate()` and would catch any remaining orphan or missing-file errors
  - [ ] 6.2 If a test fails with `KK013` (orphan), a file is on disk but not in the manifest — re-run `node scripts/register-example-specs.mjs` and inspect its output
  - [ ] 6.3 If a test fails with `KK012` (incomplete), a manifest entry references a file that does not exist on disk — create the missing file or remove the stale manifest entry
  - _Requirements: R3.2, R3.4_

- [ ] 7. Run structural and full test suite
  - [ ] 7.1 Run `pnpm test -- tests/structural/preset-thresholds.test.ts` and confirm all five threshold assertions for the affected preset still pass (spec files do not change agent/skill/command/hook/workflow counts)
  - [ ] 7.2 Run `pnpm test` (full suite) and confirm zero regressions — all unit, property, and structural tests pass
  - _Requirements: R4.1, R4.2_

- [ ] 8. End-to-end install verification
  - [ ] 8.1 Build the CLI: `pnpm -r build`
  - [ ] 8.2 Create a temporary workspace: `mkdir /tmp/kk-spec-verify && cd /tmp/kk-spec-verify`
  - [ ] 8.3 Run `node /path/to/repo/packages/cli/dist/index.js init --preset <preset> --yes` and confirm exit code 0
  - [ ] 8.4 Verify the spec files landed in the workspace: confirm `.kiro/specs/example-<name>/requirements.md`, `design.md`, `tasks.md`, and `.config.kiro` all exist
  - [ ] 8.5 Confirm `.kiro/specs/example-<name>/.config.kiro` contains a valid UUID in the `specId` field
  - [ ] 8.6 Run `node /path/to/repo/packages/cli/dist/index.js doctor` in the temporary workspace and confirm no errors related to the new spec files
  - _Requirements: R2.4, R4.3, R5.1, R5.2_

- [ ] 9. Update documentation
  - [ ] 9.1 If the preset's own `README.md` lists its example specs by name, add the new spec name and a one-sentence description of its subject
  - [ ] 9.2 If the repository root `README.md` references the number of example specs per preset, update the count to include the new spec
  - _Requirements: R1.5_

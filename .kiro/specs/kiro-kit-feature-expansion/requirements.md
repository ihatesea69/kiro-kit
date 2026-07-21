# Requirements Document

## Introduction

Kiro-Kit ships strong Steering and Skills content, but three areas that make a
Kiro workspace feel "batteries-included" are thin: **Powers** are recommendation
lists only, **Specs** ship as empty scaffolds, and the bundled **hooks** are
shell notifiers rather than Kiro's native Agent Hooks. This feature expands all
three across every preset: native `*.kiro.hook` files, worked best-practice
example specs, and an enriched Powers catalog that auto-wires credential-free
MCP servers on `init`.

## Glossary

- **CLI**: the `kiro-kit` npm command-line tool.
- **Preset**: a role bundle (frontend, backend, fullstack, mobile, devops, data-ai).
- **Native Agent Hook**: Kiro's event-driven automation, a `*.kiro.hook` JSON file with a `when` trigger and a `then` action (`askAgent` or `runCommand`).
- **Example Spec**: a fully-written requirements/design/tasks trio shipped read-only as a learning reference (distinct from an editable `_template`).
- **EARS**: Easy Approach to Requirements Syntax — `WHEN … THE SYSTEM SHALL …` and related forms.
- **Power**: a Kiro IDE integration; many are backed by an MCP server.
- **Powers Catalog**: enriched metadata (category, auth type, env vars, MCP backing) describing recommended Powers.
- **Manifest**: a preset's `manifest.json`, which declares every shipped file (strict no-orphan contract).

## Requirements

### Requirement 1: Native Agent Hooks per Preset

**User Story:** As a Kiro user, I want native Agent Hooks installed with my preset, so that event-driven automation works in the Kiro IDE without me writing hook JSON by hand.

#### Acceptance Criteria

1. THE CLI SHALL ship, in every preset, a set of native `*.kiro.hook` files comprising shared hooks plus at least 3 domain-specific hooks.
2. THE native hooks SHALL be valid JSON conforming to the Kiro hook schema (`enabled`, `name`, `description`, `version`, `when`, `then`).
3. WHERE a hook action is `askAgent`, THE hook SHALL ship with `"enabled": false` so a fresh `init` never triggers agent-credit usage without opt-in.
4. THE CLI SHALL declare every native hook file in the preset manifest so the no-orphan and tracked-files invariants hold.
5. WHEN a preset is installed, THE CLI SHALL write the native hooks into `.kiro/hooks/` alongside existing shell notifier scripts.
6. THE native hooks SHALL be documented by a `native-hooks.md` guide in each preset's `hooks/` directory explaining triggers, credit cost, and how to enable.

### Requirement 2: Worked Example Specs per Preset

**User Story:** As a developer new to spec-driven development, I want a realistic worked spec for my stack, so that I can learn the requirements→design→tasks flow by example.

#### Acceptance Criteria

1. THE CLI SHALL ship exactly one example spec per preset under `specs/examples/<feature>/` containing `requirements.md`, `design.md`, and `tasks.md`.
2. THE example `requirements.md` SHALL use EARS notation for every acceptance criterion and SHALL include user stories, a glossary, and edge-case + non-functional criteria.
3. THE example `design.md` SHALL cover all requirements and SHALL include at least one Mermaid diagram plus data models, error handling, and a testing strategy.
4. THE example `tasks.md` SHALL contain discrete, dependency-ordered tasks where each top-level task references the acceptance criteria it satisfies (traceability).
5. THE example specs SHALL be distinct from the editable `_templates/` and SHALL be declared in the preset manifest as `type: "spec"`.

### Requirement 3: Spec-Authoring Guidance

**User Story:** As a developer, I want built-in guidance on writing good specs, so that I apply EARS and the approval-gate workflow correctly instead of over-specifying small changes.

#### Acceptance Criteria

1. THE CLI SHALL ship a steering document describing the EARS patterns, the requirements→design→tasks approval gates, and when to use a lightweight plan instead of a full spec.
2. THE spec-authoring guidance SHALL be installed into `.kiro/steering/` on init.
3. THE CLI SHALL provide a `kiro-kit spec new <name>` command that scaffolds a new spec folder from the preset template with pre-filled front matter.

### Requirement 4: Enriched Powers Catalog with MCP Auto-Wire

**User Story:** As a developer, I want relevant Powers recommended and their credential-free MCP servers wired up automatically, so that my workspace is usable immediately after init.

#### Acceptance Criteria

1. THE Powers catalog SHALL record, for each Power, its category, authentication type (`none` | `apiKey` | `oauth`), required environment variables, and whether it is MCP-backed.
2. THE CLI SHALL expand the per-preset Powers recommendations beyond the current set to cover hosting, observability, auth, and data tooling relevant to each role.
3. WHEN `init` runs and a recommended Power is MCP-backed with `auth: none`, THE CLI SHALL write that server enabled into the MCP configuration.
4. WHEN a recommended Power requires credentials, THE CLI SHALL scaffold it disabled with the required environment variables documented in the setup guide, and SHALL NOT enable it.
5. THE CLI SHALL never overwrite an existing user-defined MCP server entry when auto-wiring Powers.

### Requirement 5: Validation and Integrity

**User Story:** As a maintainer, I want doctor checks and structural tests for the new artifacts, so that a broken hook or incomplete example spec is caught before release.

#### Acceptance Criteria

1. THE `kiro-kit doctor` command SHALL validate that every `*.kiro.hook` in the workspace is parseable JSON with the required fields, reporting a FAIL when one is malformed.
2. THE `kiro-kit doctor` command SHALL verify that each example spec directory contains all three required files.
3. THE structural test suite SHALL assert that every preset ships at least the required number of native hooks and exactly one complete example spec.
4. WHEN any new artifact file exists on disk without a manifest declaration, THE existing no-orphan test SHALL FAIL.

### Requirement 6: Documentation and Release

**User Story:** As a user reading the README, I want the new capabilities documented, so that I know what each preset now provides.

#### Acceptance Criteria

1. THE README SHALL document native Agent Hooks, example specs, and the enriched Powers catalog with per-preset coverage.
2. THE CHANGELOG SHALL record the feature under a new minor version.
3. THE CLI package version SHALL be bumped to the new minor version.

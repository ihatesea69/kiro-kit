# Implementation Plan: Kiro-Kit Feature Expansion

## Overview

Expand every preset with native Agent Hooks, worked example specs, and an enriched
Powers catalog that auto-wires credential-free MCP servers, then add validation
and docs. Each phase builds on the last and ends by wiring the artifacts into the
existing install/validation pipeline.

## Tasks

- [x] 1. Native Agent Hooks generation
  - [x] 1.1 Author `scripts/generate-native-hooks.mjs` with a single data model for shared + domain hooks
  - [x] 1.2 Emit 4 shared + 3 domain `*.kiro.hook` files per preset, all `enabled:false`
  - [x] 1.3 Emit a `native-hooks.md` guide into each preset's `hooks/`
  - _Requirements: R1.1, R1.2, R1.3, R1.6_

- [x] 2. Worked example specs
  - [x] 2.1 Define one realistic feature per preset (product-listing, api-key-auth, stripe-checkout, offline-notes, blue-green, churn-prediction)
  - [x] 2.2 Author `requirements.md` (EARS + user stories + edge cases) per preset
  - [x] 2.3 Author `design.md` (Mermaid + data models + testing) per preset
  - [x] 2.4 Author `tasks.md` (traceable, dependency-ordered) per preset
  - _Requirements: R2.1, R2.2, R2.3, R2.4_

- [x] 3. Spec-authoring guidance
  - [x] 3.1 Add `steering/spec-driven-development.md` (EARS, approval gates, when-not-to-spec)
  - [x] 3.2 Add `kiro-kit spec new <name>` command scaffolding from templates
  - _Requirements: R3.1, R3.2, R3.3_

- [x] 4. Enriched Powers catalog + MCP auto-wire
  - [x] 4.1 Extend `PowerEntrySchema` with optional category/auth/envVars/mcpBacked (backward compatible)
  - [x] 4.2 Expand each preset's `powers.json` with more role-relevant Powers + metadata
  - [x] 4.3 Expand `MCPConfigurator` no-credential server catalog and wire enabled entries on init
  - [x] 4.4 Keep credentialed Powers scaffolded disabled; never overwrite user MCP entries
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [x] 5. Manifest reconciliation + validation
  - [x] 5.1 Author `scripts/sync-preset-manifests.mjs` to declare all new files with inferred types
  - [x] 5.2 Extend `doctor` with native-hook JSON validation and example-spec completeness checks
  - [x] 5.3 Add structural tests: native-hook count, schema validity, one complete example spec per preset
  - _Requirements: R1.4, R5.1, R5.2, R5.3, R5.4_

- [x] 6. Documentation and release
  - [x] 6.1 Update README with native hooks, example specs, and enriched Powers sections
  - [x] 6.2 Update CHANGELOG under the new minor version
  - [x] 6.3 Bump CLI package version
  - [x] 6.4 Build, typecheck, and run the full test suite green
  - _Requirements: R6.1, R6.2, R6.3, R5.3_

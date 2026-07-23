# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-07-23

### Added

- **New `kiro-kit-dev` preset** (the 7th) — for developing the Kiro-Kit CLI itself and TypeScript ESM CLI tools in a pnpm monorepo. Based on the engineer base (19 agents, 24 skills, 66 commands) with:
  - Specialized steering: `preset-authoring` (manifest schema + the no-orphan invariant + thresholds), `cli-architecture` (core modules + the three invariants), `testing-strategy` (unit/property/structural), `typescript-cli-conventions`, plus `kiro-kit-development` and `spec-driven-development`.
  - Three meta example specs: `add-new-preset`, `add-cli-command`, `spec-library-expansion` (each with `.config.kiro`).
  - Powers: Context7, Snyk, Postman.
- Wired the new preset name through `PresetNameSchema`, `MCPConfigurator`, the structural/property test suites, and the README preset + Powers matrices.

## [0.6.0] - 2026-07-23

### Added

- **12 new worked example specs** across 4 presets (each with `.config.kiro` so it appears in Kiro's Specs panel), grounded in web-researched best practices:
  - **frontend**: Landing Page (conversion), Analytics Dashboard, Web Performance Optimization (Core Web Vitals — LCP < 2.5s, INP < 200ms, CLS < 0.1, RUM + Lighthouse CI).
  - **backend**: Background Job Queue (retries/DLQ/idempotency), Webhook Delivery System (HMAC signing/replay), Caching Strategy (multi-layer, stampede protection).
  - **devops**: AWS Serverless API (Lambda + API Gateway + DynamoDB + CDK, one-function-per-route, least-privilege IAM), AWS CDK Infrastructure (modular constructs, cdk-nag), CI/CD Pipeline (GitHub Actions OIDC → AWS, diff gate, rollback).
  - **data-ai**: Model Evaluation Pipeline (offline CI gate + online drift/regression), LLM Evaluation Harness (rubric/LLM-as-judge/safety metrics), RAG Chatbot (retrieval + rerank + citations + faithfulness eval).
- **Enhanced spec template** (applied to the new specs) with an `## Out of Scope` section, a `## Files & Interfaces` section, an end-to-end verification task, and a final documentation task — matching Anthropic's spec-writing best practices.

## [0.5.0] - 2026-07-22

### Added

- **`kiro-kit powers install` / `powers list`** — install real Kiro marketplace Powers automatically. Kiro Powers live in `~/.kiro/powers/` (user-global) and are IDE-managed, so unlike workspace files they can't just be copied; this command replicates the IDE's install (shallow-clone the power's repo, copy it into `installed/`, register it in `installed.json`).
  - Only clones from a hardcoded, trusted catalog of **official** power repos (`kirodotdev/powers`, `figma/mcp-server-guide`, `supabase-community/kiro-powers`) — never an arbitrary URL.
  - Detects a running Kiro (which would overwrite `installed.json` on exit) and refuses unless `--force`; backs up `installed.json`; fully reversible.
  - `--preset <name>` installs the powers relevant to a preset; `--all` installs the whole catalog.
- **`init` opt-in prompt** to install those Powers right after bootstrap (interactive only — never a silent side effect of `--yes`/CI; if Kiro is running it prints instructions instead).

### Notes

- Powers depending on an MCP server won't expose tools while a Kiro org has MCP disabled, but their `POWER.md` steering still applies.
- Context7, Upstash, Snyk, and Sentry are MCP servers (configured in `.kiro/settings/mcp.json`), not marketplace Powers.

## [0.4.2] - 2026-07-22

### Fixed

- **Example specs now appear in Kiro's Specs panel.** They shipped nested under `specs/examples/<feature>/` without the `.config.kiro` marker Kiro uses to recognize a spec, so the panel stayed empty. Each is now a direct child `.kiro/specs/example-<feature>/` with a `.config.kiro` marker.
- **MCP auto-wire now also writes `.kiro/settings/mcp.json`** — the location the Kiro IDE actually reads — in addition to the root `.mcp.json` (Claude/Cursor convention). Existing user-defined servers are never overwritten. (Note: MCP still won't appear if your Kiro organization has disabled MCP.)
- **Removed broken manifest entries** for gitignored build artifacts (`skills/mcp-management/scripts/dist/*.js`) and a stray `test_failures.log` that were declared but never packaged — fixes the "source file missing" skips and the no-broken-link check.

### Changed

- `doctor` and the structural tests validate example specs at `.kiro/specs/example-*` with a `.config.kiro` marker.

## [0.4.1] - 2026-07-21

### Security

- **Fully close the `@mcp/docs-seeker` dependency-confusion vector.** 0.4.0 fixed the `.mcp.json.example` files and the CLI auto-wire catalog, but the `mcpServers` block inside each preset's `manifest.json` — which is written to `.kiro/settings/mcp.json` on `init` — still referenced the unclaimed `@mcp/docs-seeker` scope plus the non-existent `@playwright/mcp-server`, `server-git`, `server-fetch`, `server-docker`, and `server-jupyter`. All preset manifests are now corrected (docs-seeker/docker/jupyter removed; git/fetch → `uvx`; playwright → `@playwright/mcp`), so a fresh `init` no longer writes any of these into the workspace MCP config.

## [0.4.0] - 2026-07-13

### Added

- **Native Kiro Agent Hooks**: every preset now ships 7 native `*.kiro.hook` files (4 shared + 3 domain-specific) using Kiro's real `when`/`then` event-driven format. All ship `enabled: false` (opt-in) so a fresh workspace never starts an unrequested agent run. Each preset includes a `hooks/native-hooks.md` guide.
- **Worked example specs**: each preset ships a fully-written best-practice spec under `specs/examples/` (Product Listing, API Key Auth, Stripe Checkout, Offline-first Notes, Blue-Green Deployment, Churn Prediction) demonstrating EARS acceptance criteria, Mermaid diagrams, and task-to-requirement traceability.
- **`spec-driven-development.md` steering** teaching EARS patterns, approval gates, and when to skip the full spec workflow.
- **`kiro-kit spec new <name>`** command to scaffold a new spec folder from an installed template (`--from <preset>`, `--force`).
- **Enriched Powers catalog**: `powers.json` entries now carry `category`, `auth`, `envVars`, and `mcpBacked` metadata (backward compatible). Per-preset recommendations expanded (Vercel, Sentry, Clerk, Upstash, Expo, Pulumi, Hugging Face, and more).
- **MCP auto-wire**: credential-free servers `memory`, `context7`, and `sequential-thinking` are now enabled on init; `github` and `sentry` scaffolded disabled.
- **doctor**: two new checks — native hook JSON validity and example-spec completeness (10 validations total).
- Maintenance scripts: `generate-native-hooks.mjs`, `generate-powers.mjs`, `sync-preset-manifests.mjs`.

### Security

- **Removed `@mcp/docs-seeker`** from all `.mcp.json.example` files — the `@mcp` npm scope is unclaimed, so `npx -y @mcp/docs-seeker` was a dependency-confusion RCE vector. The kit already ships a docs-seeker skill.
- **Corrected non-existent MCP package names** (`server-git`/`server-fetch` → `uvx` Python servers, `server-playwright`/`@playwright/mcp-server` → `@playwright/mcp`; removed phantom `server-docker`/`server-jupyter`) in `MCPConfigurator` and all example configs.
- **`restore --timestamp`** now validates the timestamp format and guards writes with `safePathInside` (was a `../` path-traversal into the workspace).
- **`spec new --from`** now rejects non-bare template names (was a `../` traversal that could read arbitrary files into a spec).
- **`scout-block` guard** now reads tool context from stdin JSON (with argv fallback), so it actually inspects commands; broadened patterns (`rm -rf $HOME`, `find … -delete`, structural fork-bomb).
- **Discord/Telegram shell notifiers** build JSON via `jq`/`node` (no injection/malformed payloads); the Telegram bot token is passed via a curl config on stdin so it no longer appears in the process table.
- **`secret-scan` native hook** scoped to file writes (`fileEdited`) instead of every tool call (avoids credit drain).
- **`build-verify` hook** now blocks (exit 1) when artifacts are missing instead of failing open.
- Hardened `mergeMCP` (`Object.hasOwn`), `mergeHooks` (`safePathInside` guard), and `ConflictResolver` (ENOENT-safe read).

### Changed

- README documents native Agent Hooks, example specs, and the enriched Powers catalog.
- `.env.example` generation now derives required variables from Power `envVars` metadata.
- Atomic writes for `metadata.json` and the tracking store (crash-safe).
- `update` no longer records the new content hash for files the user skipped (was stranding them on old versions).
- Line-ending-normalized content comparison so re-`init` is idempotent on Windows (CRLF vs LF).
- Accurate telemetry `enable` message (no data is transmitted in this version).

## [0.3.8] - 2025-05-20

### Fixed

- Logo: use static figlet import + mark as external in tsup to fix CJS/ESM conflict — logo now renders correctly in all terminals
- Updated diff dependency to 9.0.0 (security fix)

### Changed

- README: updated GitHub and npm README with CLI UI, domain hooks, MCP auto-config sections

## [0.3.7] - 2025-05-20

### Added

- Purple gradient theme: violet-400 → indigo-400 → pink-400 across logo, boxes, and accents
- Separator line between logo and command list
- Icons in command list (▶ init, + add, ≡ list, ♥ doctor)
- Polished summary box with checkmark, bullet icons, and cleaner layout
- Figlet "Slant" font for logo (fits in standard 80-col terminal without wrapping)
- Preset selector: instruction bar shows Up/Down/Enter/A/Enter x2 hint with live selected count

### Changed

- Removed "Did you know?" tip box from welcome screen (cleaner layout)
- Updated ThemedBox border colors to match purple theme (violet, indigo, emerald, amber, pink)
- Default palette updated: primary #c084fc, secondary #818cf8, muted #7c6f9f
- Preset selector: Enter = toggle select, Enter x2 on same item = confirm

## [0.3.5] - 2025-05-20

### Fixed

- Preset selector: replaced save/restore cursor with cursor-up redraw — fixes duplicate rendering in PowerShell
- Preset selector: handle `\r\n` Enter key sequence correctly

## [0.3.4] - 2025-05-20

### Fixed

- ThemedPrompt: replaced `prompts` library with raw readline-based implementation so preset selection UI works in all terminals including IDE terminals and PowerShell

## [0.3.3] - 2025-05-20

### Added

- Rich CLI UI layer: ASCII logo with gradient, themed boxes, task progress list (listr2), spinner (ora)
- TerminalCapability detector: respects NO_COLOR, CI, non-TTY, TERM=dumb, Windows cmd
- Theme system with purple/blue palette and semantic tokens
- Logo renderer: figlet ANSI Shadow font + gradient-string, compact fallback for narrow terminals
- ThemedBox: rounded border boxes with info/tip/success/warn/error variants
- TaskRunner: listr2 for interactive TTY, simple `->` renderer for CI/non-TTY
- ThemedPrompt: prompts-based multi-select, confirm, conflict choice with SIGINT handling
- Init Screens: welcome (logo + tip box + command list), summary (success box), errorBox
- Postinstall script: light welcome box on npm install (no heavy deps, always exits 0)
- Vendor lazy adapter: dynamic imports with null fallback for all UI deps

### Changed

- init.ts fully refactored to use UI layer — all readline custom prompts replaced
- Bundle size: 669KB (includes bundled ESM-only UI deps)

## [0.3.2] - 2025-05-20

### Fixed

- CLI preset selection display: truncate long descriptions to terminal width to prevent line overflow

## [0.3.1] - 2025-05-20

### Fixed

- FrontMatterParser: removed incorrect leading newline strip in parse() that broke round-trip property
- Skill discoverability test: added `common` folder to ignored entries (shared utility, not a skill)

## [0.3.0] - 2025-05-20

### Added

- Kiro Powers integration: each preset now recommends curated Powers from kiro.dev marketplace
- `powers.json` per preset with 3-tier system (essential/recommended/optional)
- Domain-specific Agent Hooks: 18 new hooks (3 per preset) for role-specific automation
  - frontend: accessibility-check, bundle-size-guard, component-test-reminder
  - backend: api-schema-validate, migration-safety-check, endpoint-test-coverage
  - fullstack: type-sync-check, api-client-gen, deployment-readiness
  - mobile: platform-parity-check, asset-optimization, release-checklist
  - devops: terraform-plan-review, container-scan, cost-estimation
  - data-ai: data-drift-check, model-card-update, experiment-log
- MCP Server auto-configuration: `kiro-kit init` now generates functional `.mcp.json` (not just .example)
  - Default servers (filesystem, git, fetch) enabled immediately
  - Credential-requiring servers (postgres, docker) included as disabled with instructions
- `POWERS-SETUP.md` generated in `.kiro/` with step-by-step Power installation guide
- `.env.example` auto-updated with required environment variables grouped by service
- CLI flags: `--powers <none|all|interactive>` and `--quiet`
- New core modules: PowersLoader, MCPConfigurator, SetupGuideGenerator, EnvTemplateGenerator, PowersPrompter
- `powers` artifact type added to ManifestParser schema

### Changed

- Init flow now includes Powers recommendation, MCP auto-config, and env template generation after file processing
- All 6 preset manifests updated with powers.json and domain hook entries

## [0.2.4] - 2025-05-18

### Added

- ClaudeKit parity sync: ported 348+ files from reference kit to reach full content parity
- New commands: ask, brainstorm, code, cook, debug, journal, use-mcp, watzup, and 20+ more per preset
- New skills with full progressive disclosure (references/ + scripts/ subdirectories)
- Root-level tooling: .commitlintrc.json, .repomixignore, KIRO.md, GEMINI.md, docs/guide/
- Parity sync maintainer tool at scripts/parity-sync/ with 12 property-based tests
- Manifest validation tests (no-orphan, no-broken-link)
- Tri-script completeness tests (Property 9)
- Sub-skill subtree completeness tests (Property 12)

### Changed

- Raised structural test thresholds: agents 12 to 16, skills 20 to 22, commands 25 to 40
- Updated preset counts: frontend 71 commands, backend 66, fullstack 73, mobile 71, devops 65, data-ai 70
- Manifest updater now validates round-trip JSON, no-orphan, and no-broken-link invariants
- README updated with accurate per-preset artifact counts

### Fixed

- .gitkeep files no longer trigger orphan validation errors in manifest checks

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.5] - 2026-07-29

### Changed

- **The npm package page was showing a README from the v0.3.x era.** It advertised "6 curated presets" (there are 9 — `ai-engineer`, `sa`, and `kiro-kit-dev` were missing), carried per-preset artifact counts that had drifted out of date, described MCP credentialed servers as `_disabled_` entries — the exact behaviour 0.10.3 fixed — and led with a screenshot of the v0.3.8 selector. Rewritten against what actually ships, with the new banner.
- The README no longer hand-writes per-preset counts or catalogs. Those live in the [preset reference](https://ihatesea69.github.io/kiro-kit/docs/reference), which is generated from the shipped manifests, so this page cannot drift the same way again.
- Corrected the documented flags: `-v` is `--version`, not `--verbose`, and `--quiet` has no `-q` shorthand. Added `--preset` and `kiro-kit spec new`, which were missing.
- npm now picks up the current package description and the plainer copy introduced in the docs refresh.

## [0.10.4] - 2026-07-29

### Fixed

- **`kiro-kit@0.10.3` on npm shipped a two-month-old build — install 0.10.4 instead.** `npm publish` packs whatever is in `dist/`, and nothing rebuilt it first, so a `dist/` last written on 20 May went out under the 0.10.3 tag. That tarball carries the CLI as it stood before the `kiro-kit-dev`, `sa`, and `ai-engineer` presets existed: `init --preset sa` (and `ai-engineer`, `kiro-kit-dev`) fails on it, none of the 0.10.3 MCP fixes are actually present, and 41 stray `.coverage` files ride along. The published artefact for 0.10.3 never matched its source tag.
- **A stale `dist/` can no longer be published.** `packages/cli` now runs `prepublishOnly: clean && build`, so `npm publish` always rebuilds from source first.

## [0.10.3] - 2026-07-29

### Fixed

- **MCP servers no longer show up red in a fresh workspace.** `init` wrote server definitions Kiro could not start, so the MCP panel filled with failures on first open. Five distinct causes:
  - `${WORKSPACE_ROOT}` was written verbatim. Kiro does not interpolate it, so the filesystem server received a literal `${WORKSPACE_ROOT}` path. It is now resolved at write time.
  - Servers needing credentials were "disabled" by renaming the key to `_disabled_<name>`, which is not a Kiro convention — Kiro saw a server literally named `_disabled_github` and tried to launch it. They now use Kiro's own `"disabled": true` field, with a `_comment` naming the variable to set. Existing `_disabled_*` keys are migrated on the next `init`.
  - `uvx`-based servers (git, fetch) were enabled by default but need the `uv` Python toolchain, which most machines lack. They now ship disabled with install instructions.
  - Unresolved `${VAR}` placeholders in a server's `env` now disable that server rather than letting it fail at launch.
  - MCP auto-configuration was nested inside the "Configuring Powers" task, so `--powers none` silently skipped it and the two write paths disagreed. It is now its own task, and the root `.mcp.json` and `.kiro/settings/mcp.json` are written from the same normalised config.
- A server the user enabled by hand is never switched back off by a later `init`, and user-defined servers are still never overwritten.
- **A backup/restore property test generated `.` as a filename**, so `path.join(kiroDir, '.')` resolved to the directory itself and the write failed with EISDIR. Only some seeds produced it, so it read as CI flake rather than a generator bug. `.` and `..` are now excluded.
- **Documents named after an `Object.prototype` key no longer break the rebrander.** `gray-matter` memoises into a plain object keyed by the raw string, so content of exactly `toString`, `constructor`, `__proto__` (and friends) hit the prototype, were mistaken for a cached result, and parsed to `body: undefined` — crashing the next string operation. Parsing now opts out of that cache. This surfaced as the p04 property test failing on roughly 1 CI job in 9.

## [0.10.2] - 2026-07-29

> Note: 0.10.1 was tagged but never reached npm, so its fixes ship here too.

### Added

- **Cross-platform CLI smoke test** (`scripts/smoke-cli.sh`) plus a `smoke` CI job on `ubuntu-latest` and `macos-latest`. The vitest suite only exercises core modules in-process — it never spawns the binary — so it could not catch the v0.8.1 init hang, and it cannot catch TTY or POSIX file-mode bugs. The smoke job installs the packed tarball and drives the real CLI: multi-preset `init` under a timeout with stdin closed, idempotent rerun, `+x` on shipped `.sh` files, LF shebangs, and `doctor`.
- `.gitattributes` pinning `*.sh` (and other text) to LF in the working tree. Without it, Git's `autocrlf` on Windows checks scripts out with CRLF, and a CRLF shebang fails on macOS/Linux with `bad interpreter: /bin/bash^M`.

### Fixed

- **23 shipped `.sh` files installed without the executable bit on macOS and Linux** (`skills/chrome-devtools/scripts/install.sh`, `install-deps.sh`, `skills/debugging/scripts/find-polluter.sh` across all 9 presets). Their manifest entries were missing `executable: true`, so users had to `chmod +x` by hand. Invisible on Windows, which has no exec bit — found by running the CLI in a Linux container.
- `sync-preset-manifests.mjs` now sets `executable: true` on new `.sh` declarations, so the drift above cannot silently return.

## [0.10.1] - 2026-07-29

### Fixed

- **Preset descriptions in the `init` selector were years out of date** — `backend` advertised 19 agents / 20 skills when it ships 25 / 23, and none of the four presets carrying `deep-security-scan` mentioned it, so the feature looked missing from the picker even though it installs correctly. All 9 `manifest.json` descriptions now carry real agent/skill/command counts, and `backend`, `fullstack`, `devops`, `sa` say "whole-repo deep security scanning".
- Corrected the same stale counts in the README preset matrix (every row was off in at least one column).

## [0.10.0] - 2026-07-28

### Added

- **New `ai-engineer` preset** (the 9th) — for building production chatbots and AI agents on AWS. Based on the `data-ai` preset (20 agents, 35 skills, 70 commands) with:
  - **Specialized skills**: `bedrock-agentcore` (Runtime deployment, Harness vs Runtime vs Lambda, Memory tiers, the `0.0.0.0:8000/mcp` streamable-HTTP contract), `agentcore-gateway-mcp` (Lambda/OpenAPI/Smithy → MCP tools, the four outbound auth modes, the IAM SigV4 compatibility matrix, semantic tool discovery via `x_amz_bedrock_agentcore_search`, the `DYNAMIC`-mode gotcha), `mcp-server-hosting` (remote MCP on Lambda/Fargate/Runtime, OAuth via Cognito/Okta/Auth0, the RFC 7235 401 + `WWW-Authenticate` handshake), `strands-agents` (the default framework — model-driven tool loop, MCP clients, multi-agent, streaming, hooks), `bedrock-rag` (Knowledge Bases, chunking, hybrid search, verified citations, contextual grounding), `agent-evaluation` (golden sets, deterministic checks, LLM-as-a-Judge, CI thresholds, drift monitoring).
  - **Steering**: `aws-native-agents` (AgentCore component map + the Harness/Runtime/Lambda decision tree), `mcp-architecture` (client/server/transport model, hosting choices, the auth decision tree, the two production gotchas), `agent-design-patterns` (escalation ladder, tool-loop invariants, supervisor/worker, memory tiers), `agent-evaluation` (eval as CI gate), `responsible-ai` (guardrails, prompt-injection defence, PII, cost caps), plus `spec-driven-development`.
  - **Domain native hooks**: Prompt Change Eval, Tool Contract Check, Agent Card Update (replacing the inherited ML-flavoured ones).
  - **4 example agent specs** (each with `.config.kiro`, enhanced template): AgentCore Support Chatbot (Strands on Runtime + Memory + Gateway tool + Guardrails), MCP Server on Lambda (OAuth-protected, registered as a Gateway 2LO target), RAG Knowledge Assistant (Bedrock Knowledge Bases with evaluation gates), Multi-Agent Orchestrator (supervisor/worker over A2A).
  - Powers: AWS IaC + Terraform (essential), Context7 + Exa + Hugging Face (recommended), Langfuse/LangSmith/Datadog/Pinecone/Snyk (optional).
- Wired the new preset name through `PresetNameSchema`, `MCPConfigurator`, `PowerInstaller.POWER_CATALOG`, the structural/property test suites, `sync-preset-manifests.mjs`, and the README preset + example-spec + Powers matrices.

### Fixed

- Corrected stale "6 presets" counts in `README.md`, `docs/architecture.md`, and `docs/how-it-works.md` (now 9).

## [0.9.0] - 2026-07-28

### Added

- **`deep-security-scan` feature** — a whole-repository security scan added to the `backend`, `fullstack`, `devops`, and `sa` presets (12 files each). Clones the *contract* of Codex Security's Deep Scan (scopeable invocation, preflight, findings-workspace output); the pipeline is our own, built on published open-source security-review methodology plus multi-agent recon-partitioning and serial-judge dedup patterns.
  - **Command** `commands/security/deep-scan.md` — `/security:deep-scan [path] [partitions]`, orchestrating preflight → recon → parallel find → adversarial validate → serial judge → report.
  - **5 agents**: `security-recon` (partitions the attack surface, writes `scan-manifest.json`), `security-finder` (per-partition data-flow hunter, writes candidates incrementally so a dead subagent loses nothing), `security-validator` (prompted to *refute* one candidate, confidence 1–10 — **below 8 is dropped**), `security-judge` (single serial dedup pass by root cause: new / better-example / duplicate), `security-reporter` (writes the findings workspace).
  - **Skill** `deep-security-scan` (SKILL.md + `severity-taxonomy.md`, `finding-template.md`, `vuln-classes.md` references) — three-phase methodology (repository context → comparative analysis vs the codebase's own defenses → data-flow assessment), the severity ladder, and the **hard exclusions** (DoS, rate limiting, resource exhaustion, open redirects, generic input validation without a proven exploit path) that keep false positives near zero.
  - **Steering** `security-scanning.md` — the scope split (`/review:security` = per-diff gate · `security-auditor` = infra/compliance · deep scan = whole-repo application code) plus the findings-workspace contract: append-only scan history, `findings.json` as the CI contract, read-only scans.
  - **Native hook** `deep-scan-stale.kiro.hook` (`userTriggered`, disabled by default) — reports whether the last scan is stale or predates material source changes.
  - Output workspace: `.kiro/security/scans/<yyyy-mm-dd>-<n>/` with `report.md`, `findings/<slug>/finding.md`, `hardening/<topic>.md`, `scan-manifest.json`, `findings.json`, `coverage.json`.
- `generate-native-hooks.mjs` now emits per-feature hooks (`DEEP_SCAN_PRESETS`) alongside shared and domain hooks, including for presets outside its main loop (`sa`).
- **Deep scan CI gate** — `skills/deep-security-scan/scripts/check-findings.mjs`, a zero-dependency Node ≥18 script that reads the newest scan's `findings.json` and exits non-zero on open findings at or above a threshold (`--fail-on`, `--scan-dir`, `--max-age-days`, `--format github`; exit `2` distinguishes "never scanned" from "found something"). Ships with `assets/deep-scan-gate.yml` (GitHub Actions template: blocks on open CRITICAL/HIGH per PR, enforces 30-day freshness on the weekly schedule only) and `references/ci-integration.md`.
- **Deep scan re-scans** — a scan that finds a previous one now produces a delta. The judge matches findings by root cause and reuses the previous slug, so a finding keeps one identity across its life, and marks each `new` / `persisting` / `regressed`; the reporter writes `delta.md` plus `delta` and `previousScanId` in `findings.json`. A scoped re-scan may only mark findings *inside* the scanned scope as fixed — everything else is carried forward and reported as not re-examined.
- **Deep scan Semgrep hybrid mode** (`--semgrep`, optional) — SAST-first candidate generation with a new `security-triage` agent classifying each Semgrep result true/false positive against real source context (QASecClaw pattern), plus `references/semgrep-hybrid.md`. Triaged candidates pass through the same adversarial validator and the same ≥8/10 gate; the mode degrades silently when Semgrep is absent and never installs it.
- Finding `status` now spans `open` / `fixed` / `accepted-risk` (only `open` blocks CI, `accepted-risk` requires a written justification), and findings carry a `source` of `manual` or `semgrep`.

## [0.8.1] - 2026-07-28

### Fixed

- **`init` appeared to hang forever at "Writing workspace files"** when 2+ presets were selected. Presets overlap on 100+ target files with differing content, so the write loop hit a conflict and `await`ed an interactive overwrite/skip prompt — but the listr2 spinner owns the terminal while tasks run, so the prompt was invisible and the CLI looked frozen. All interactive questions (file conflicts, Powers tier, MCP confirmation) are now asked *before* the task runner starts, and never under the spinner.
- Regular-file writes are now deduplicated across selected presets (last preset wins), eliminating self-conflicts and redundant writes for shared agents/steering files.
- The write task now streams `N/total files processed` progress under the spinner.

## [0.8.0] - 2026-07-24

### Added

- **New `sa` (Solutions Architect) preset** (the 8th) — for designing and documenting cloud architectures. Based on the `devops` preset (20 agents, IaC/AWS tooling) with:
  - **draw.io skills** `drawio-aws`, `drawio-azure`, `drawio-gcp` from [sparklabx/drawio-ai-kit](https://github.com/sparklabx/drawio-ai-kit) (MIT, attributed in `NOTICE` + `THIRD_PARTY_NOTICES.md`). They drive the external `drawio-ai` CLI (`npm i -g github:sparklabx/drawio-ai-kit` — documented prerequisite, not bundled) for real-stencil search and diagram validation.
  - **Document skills**: `architecture-deck` (.pptx architecture presentations via python-pptx), `architecture-doc` (.docx Solution Architecture Documents via python-docx), `mermaid-diagrams` (C4 context/container/component, sequence, deployment, state — with CLI validation).
  - **Steering**: `aws-well-architected` (6 pillars), `c4-model`, `architecture-decision-records`, `diagramming-conventions` (draw.io vs Mermaid, stencil discipline, layout topologies), `iac-conventions` (CloudFormation vs Terraform, least privilege, state, drift), plus `spec-driven-development`.
  - **Commands** `iac/` group: `cloudformation`, `terraform-module`, `well-architected-review`.
  - **4 example architecture specs** (each with `.config.kiro`, enhanced template): Three-Tier Web Architecture (VPC/ALB/ECS/RDS + CloudFormation), Event-Driven Microservices (API GW/Lambda/EventBridge/SQS/DynamoDB + Terraform), Data Lake (S3 tiers/Glue/Athena/Lake Formation), Multi-Region DR (warm standby, RTO/RPO, Route 53 failover).
  - Powers: Terraform + AWS CDK (essential), Context7 + Figma (recommended), Datadog + Snyk (optional).
- Wired the new preset name through `PresetNameSchema`, `MCPConfigurator`, the structural/property test suites, `sync-preset-manifests.mjs`, and the README preset + Powers matrices.

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

- the upstream kit parity sync: ported 348+ files from reference kit to reach full content parity
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

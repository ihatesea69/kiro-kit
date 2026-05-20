# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

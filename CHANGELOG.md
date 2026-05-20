# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-07-01

### Added

- New `qa-automation` preset with 18 agents, 24 skills, 46 commands
- Covers Playwright, Selenium, API testing, accessibility testing, and CI/CD integration
- Ported from fugazi/test-automation-skills-agents (MIT)
- 8 cross-platform hooks (pre-commit, pre-push, post-merge, post-checkout, plus 3 domain-specific)
- 5 workflows for test planning, execution, debugging, reporting, and accessibility auditing
- Powers integration with Playwright (essential), Context7 and Snyk (recommended)

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

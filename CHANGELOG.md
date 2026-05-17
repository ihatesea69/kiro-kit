# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffolding with pnpm monorepo
- CLI package skeleton at `packages/cli/`
- 8 CLI commands: init, add, list, info, update, restore, doctor, telemetry
- Core modules: ManifestParser, PresetLoader, ConflictResolver, MergeEngine,
  BackupManager, TrackingStore, StatuslineSelector, FrontMatterParser
- 6 curated presets: frontend, backend, fullstack, mobile, devops, data-ai
- Interactive multi-pick preset selection with conflict resolution
- Atomic file writes with backup and restore support
- Cross-platform hook system (JS/Bash/PowerShell)
- GitHub Actions CI workflow (3 OS x 3 Node versions)
- GitHub Actions publish workflow with npm provenance
- Issue templates and PR template
- Property-based tests with fast-check
- Structural tests for preset validation
- Unit and e2e test suites

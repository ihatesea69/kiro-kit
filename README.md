<div align="center">

<img src="./assets/banner.png" alt="kiro-kit" width="100%" />

[![CI](https://img.shields.io/github/actions/workflow/status/ihatesea69/kiro-kit/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/ihatesea69/kiro-kit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![license](https://img.shields.io/npm/l/kiro-kit?style=flat-square)](./LICENSE)
[![downloads](https://img.shields.io/npm/dm/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![node](https://img.shields.io/node/v/kiro-kit?style=flat-square)](https://nodejs.org)

</div>

---

## Quick Start

```bash
npx kiro-kit init
```

Pick from 6 curated presets, confirm, and your `.kiro/` workspace is ready. Agents, skills, commands, hooks, workflows, MCP servers, statusline, and spec templates - all configured.

## Presets

| Preset | Stack | What you get |
|--------|-------|--------------|
| `frontend` | React, Next.js, TypeScript | 20 agents, 23 skills, 71 commands tailored for component architecture, accessibility, and performance |
| `backend` | Node, Python, Go APIs | 19 agents, 24 skills, 66 commands for API design, database management, auth, deployment patterns |
| `fullstack` | Next.js, T3 stack | 20 agents, 30 skills, 73 commands covering frontend plus backend, payment integration, e-commerce |
| `mobile` | Flutter, React Native | 23 agents, 28 skills, 71 commands for mobile-first patterns, ai-multimodal, ui-styling |
| `devops` | Docker, Kubernetes, Terraform | 20 agents, 26 skills, 65 commands for CI checks, container scanning, infrastructure as code |
| `data-ai` | Python, ML, AI agents | 20 agents, 30 skills, 70 commands for Pandas, PyTorch, TensorFlow, Jupyter, Google ADK, document processing |

Every preset is **self-contained** with 16+ agents, 22+ skills, 40+ commands, 6+ cross-platform hooks, 4+ workflows, plus statusline scripts, MCP server templates, and spec scaffolding.

## Commands

| Command | What it does |
|---------|--------------|
| `kiro-kit init` | Interactive preset picker and workspace bootstrap |
| `kiro-kit add <preset>` | Drop another preset into an existing workspace |
| `kiro-kit list` | See all presets with artifact counts |
| `kiro-kit info <preset>` | Detailed preset contents and file targets |
| `kiro-kit update` | Pull latest preset version into your workspace |
| `kiro-kit restore` | Roll back from a timestamped backup |
| `kiro-kit doctor` | Health check (8 validations, `--fix` auto-repairs) |
| `kiro-kit telemetry` | Manage opt-in usage telemetry (off by default) |

### Common Flags

```
-y, --yes              Skip confirmation prompts
--force                Overwrite all conflicts (with backup)
--skip-existing        Skip files that already exist
--no-color             Disable ANSI output
-v, --verbose          Verbose logging
-q, --quiet            Errors only
--json                 Machine-readable output (list, info)
```

## How It Works

```
1. Pick presets       2. Resolve conflicts        3. Workspace ready
   ┌─────────┐           ┌──────────────┐            ┌───────────┐
   │ frontend│  ────►    │ Backup +     │  ────►     │  .kiro/   │
   │ devops  │           │ Atomic write │            │  Live     │
   └─────────┘           └──────────────┘            └───────────┘
```

Three principles drive every design decision:

- **Bundled, not fetched** - all presets ship in the npm tarball. Works offline after install.
- **User-priority merge** - existing user content is never silently overwritten. Conflicts always prompt.
- **Atomic writes** - temp file plus rename guarantees no partial state on crash or interrupt.

See [`docs/architecture.md`](./docs/architecture.md) for the module breakdown and [`docs/how-it-works.md`](./docs/how-it-works.md) for lifecycle details.

## Built for Real Workflows

- Cross-platform hooks (`.js` primary, `.sh` and `.ps1` fallbacks)
- 4-option conflict resolution (overwrite, skip, view diff, overwrite all)
- Timestamped backups with `restore` and `restore --list`
- Tracking file (`.kiro/.kiro-kit.json`) records what came from where
- Property-based tests verify invariants (round-trips, commutativity, idempotency)
- Structural tests enforce minimum thresholds across all 6 presets

## Privacy

Telemetry is **off by default**. No data ever leaves your machine unless you explicitly opt in:

```bash
kiro-kit telemetry status     # Check current state
kiro-kit telemetry enable     # Opt in (anonymous events only)
kiro-kit telemetry disable    # Opt out
```

Opt-in events include command name, preset selection, OS, and Node version. Never file contents, paths, or PII.

## Contributing

Got an idea for a new preset, or want to improve an existing one? See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/creating-presets.md](./docs/creating-presets.md).

```bash
git clone https://github.com/ihatesea69/kiro-kit.git
cd kiro-kit
pnpm install
pnpm test
```

## License

[MIT](./LICENSE)

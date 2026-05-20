<div align="center">

<img src="https://raw.githubusercontent.com/ihatesea69/kiro-kit/main/assets/cli-preview.png" alt="kiro-kit CLI preview" width="700" />

[![npm version](https://img.shields.io/npm/v/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![license](https://img.shields.io/npm/l/kiro-kit?style=flat-square)](https://github.com/ihatesea69/kiro-kit/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![node](https://img.shields.io/node/v/kiro-kit?style=flat-square)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/ihatesea69/kiro-kit/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/ihatesea69/kiro-kit/actions/workflows/ci.yml)

</div>

---

## Quick Start

```bash
npx kiro-kit init
```

Pick from 6 curated presets with an interactive selector — arrow keys to move, Enter to select, Enter again to confirm. Your `.kiro/` workspace is ready with agents, skills, commands, hooks, MCP servers, Powers recommendations, and spec templates.

```bash
# or install globally
npm install -g kiro-kit
kiro-kit init
```

## Why kiro-kit

Most "AI coding kits" are dotfile dumps. This one wires the whole software lifecycle into a single workflow that humans and AI both read: requirements, design, tasks, code, tests — with formal correctness properties as the glue.

Pick a preset, run one command, get a workspace where AI agents act like senior teammates instead of intern auto-completers.

## Presets

| Preset       | Stack                                | Highlights                                                                  |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| `frontend`   | React, Next.js, TypeScript           | 20 agents, 21 skills, 30 commands tuned for components, a11y, performance   |
| `backend`    | Node, Python, Go APIs                | 19 agents, 20 skills, 29 commands for API design, databases, auth, deploy   |
| `fullstack`  | Next.js, T3 stack                    | 20 agents, 22 skills, 30 commands plus payment and Shopify integration      |
| `mobile`     | Flutter, React Native                | 23 agents, 25 skills, 30 commands for mobile-first patterns and ai-multimodal |
| `devops`     | Docker, Kubernetes, Terraform        | 20 agents, 24 skills, 30 commands plus container scanning and IaC workflows |
| `data-ai`    | Python, ML, AI agents                | 20 agents, 32 skills, 35 commands for Pandas, PyTorch, Jupyter, Google ADK   |

Every preset ships **self-contained**: agents, skills, commands, cross-platform hooks, workflows, statusline scripts, MCP server templates, and spec scaffolding.

## Commands

| Command                  | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `kiro-kit init`          | Interactive preset picker and workspace bootstrap       |
| `kiro-kit add <preset>`  | Drop another preset into an existing workspace          |
| `kiro-kit list`          | See all presets with artifact counts                    |
| `kiro-kit info <preset>` | Detailed preset contents and file targets               |
| `kiro-kit update`        | Pull latest preset version into your workspace          |
| `kiro-kit restore`       | Roll back from a timestamped backup                     |
| `kiro-kit doctor`        | Health check (8 validations, `--fix` auto-repairs)      |
| `kiro-kit telemetry`     | Manage opt-in usage telemetry (off by default)          |

### Common flags

```
-y, --yes              Skip confirmation prompts
--force                Overwrite all conflicts (with backup)
--skip-existing        Skip files that already exist
--no-color             Disable ANSI output
--powers <mode>        Powers setup: none, all, or interactive (default)
--quiet                Suppress non-essential output
-v, --verbose          Verbose logging
-q, --quiet            Errors only
--json                 Machine-readable output (list, info)
```

## CLI Experience

The `kiro-kit init` command features a polished terminal UI:

- Purple gradient ASCII logo (figlet Slant font)
- Interactive preset selector with arrow keys, Enter to select, Enter x2 to confirm
- Live selected count indicator
- Task progress list with spinners
- Success summary box with file counts and next steps
- Graceful fallback for CI/non-TTY environments

## Kiro Powers Integration

Each preset recommends curated [Kiro Powers](https://kiro.dev/powers/) from the marketplace, organized by priority:

| Preset | Essential | Recommended | Optional |
|--------|-----------|-------------|----------|
| frontend | Figma | Netlify, Context7 | Snyk, ScoutQA |
| backend | Supabase | Neon, Postman, Context7 | Stripe, Snyk |
| fullstack | Supabase | Figma, Netlify, Stripe, Context7 | Firebase, LaunchDarkly |
| mobile | Firebase | Figma, Context7 | ElevenLabs, Bria |
| devops | Terraform | Datadog, Snyk, Depot | Harness, AWS CDK |
| data-ai | ClickHouse | Context7, Exa | Neon, New Relic |

After `init`, a `POWERS-SETUP.md` guide is generated with install instructions for each Power.

## MCP Server Auto-Configuration

Running `kiro-kit init` generates a functional `.mcp.json` (not just an example file):

- Servers requiring no credentials (filesystem, git, fetch) are enabled immediately
- Servers requiring credentials (postgres, docker) are included as `_disabled_` entries with instructions to enable

## Domain-Specific Hooks

Beyond generic notification hooks, each preset includes 3 domain-specific hooks:

- **frontend**: accessibility-check, bundle-size-guard, component-test-reminder
- **backend**: api-schema-validate, migration-safety-check, endpoint-test-coverage
- **fullstack**: type-sync-check, api-client-gen, deployment-readiness
- **mobile**: platform-parity-check, asset-optimization, release-checklist
- **devops**: terraform-plan-review, container-scan, cost-estimation
- **data-ai**: data-drift-check, model-card-update, experiment-log

## How it works

```
1. Pick presets       2. Resolve conflicts        3. Workspace ready
   ┌─────────┐           ┌──────────────┐            ┌───────────┐
   │ frontend│  ────►    │ Backup +     │  ────►     │  .kiro/   │
   │ devops  │           │ Atomic write │            │  Live     │
   └─────────┘           └──────────────┘            └───────────┘
```

Three principles drive every design decision:

- **Bundled, not fetched** — all presets ship in the npm tarball. Works offline after install.
- **User-priority merge** — existing user content is never silently overwritten. Conflicts always prompt.
- **Atomic writes** — temp file plus rename guarantees no partial state on crash or interrupt.

## Built for real workflows

- Cross-platform hooks (`.js` primary, `.sh` and `.ps1` fallbacks)
- 4-option conflict resolution (overwrite, skip, view diff, overwrite all)
- Timestamped backups with `restore` and `restore --list`
- Tracking file (`.kiro/.kiro-kit.json`) records what came from where
- Property-based tests verify invariants (round-trips, commutativity, idempotency)
- Structural tests enforce minimum thresholds across all 6 presets

## Privacy

Telemetry is **off by default**. Nothing leaves your machine unless you explicitly opt in.

```bash
kiro-kit telemetry status     # Check current state
kiro-kit telemetry enable     # Opt in (anonymous events only)
kiro-kit telemetry disable    # Opt out
```

Opt-in events include command name, preset selection, OS, and Node version. Never file contents, paths, or PII.

## Requirements

- Node.js 18 or later
- pnpm, npm, or yarn (only one needed for `npx`)

## Contributing

Got an idea for a new preset, or want to improve an existing one? See [CONTRIBUTING.md](https://github.com/ihatesea69/kiro-kit/blob/main/CONTRIBUTING.md) and [docs/creating-presets.md](https://github.com/ihatesea69/kiro-kit/blob/main/docs/creating-presets.md).

```bash
git clone https://github.com/ihatesea69/kiro-kit.git
cd kiro-kit
pnpm install
pnpm test
```

## Links

- Repository: https://github.com/ihatesea69/kiro-kit
- Issues: https://github.com/ihatesea69/kiro-kit/issues
- Releases: https://github.com/ihatesea69/kiro-kit/releases
- Kiro IDE: https://kiro.dev

## License

[MIT](https://github.com/ihatesea69/kiro-kit/blob/main/LICENSE)

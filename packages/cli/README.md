<div align="center">

<img src="https://raw.githubusercontent.com/ihatesea69/kiro-kit/main/assets/banner.png" alt="kiro-kit" width="100%" />

[![npm version](https://img.shields.io/npm/v/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![license](https://img.shields.io/npm/l/kiro-kit?style=flat-square)](https://github.com/ihatesea69/kiro-kit/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![node](https://img.shields.io/node/v/kiro-kit?style=flat-square)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/ihatesea69/kiro-kit/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/ihatesea69/kiro-kit/actions/workflows/ci.yml)

**[Documentation](https://ihatesea69.github.io/kiro-kit/)**

</div>

---

Setting up a [Kiro](https://kiro.dev) workspace means writing a lot of files by
hand: agents, skills, slash commands, hooks, MCP config, spec templates. Kiro-Kit
writes them for you.

Pick the preset that matches your stack and it all lands in `.kiro/`. Presets
don't depend on each other, everything ships inside the npm package so it works
offline, and nothing you already wrote gets replaced without asking first.

## Quick Start

```bash
npx kiro-kit init
```

Arrow keys to move, Enter to select, Enter again to confirm. The workspace is
ready when the command exits.

```bash
# or install globally
npm install -g kiro-kit
kiro-kit init
```

## Presets

| Preset | Stack | Focus |
|---|---|---|
| `frontend` | React, Next.js, TypeScript | Components, accessibility, performance |
| `backend` | Node, Python, Go APIs | API design, databases, auth, deployment |
| `fullstack` | Next.js, T3 stack | Frontend plus backend, payments, e-commerce |
| `mobile` | Flutter, React Native | Mobile-first patterns, multimodal AI |
| `devops` | Docker, Kubernetes, Terraform | CI/CD, container scanning, infrastructure as code |
| `data-ai` | Python, ML, AI agents | Pandas, PyTorch, Jupyter, evaluation pipelines |
| `ai-engineer` | AWS-native agents, MCP | Chatbots, agent architectures, Bedrock |
| `sa` | Cloud architecture | draw.io and Mermaid diagrams, SAD documents, decks, IaC |
| `kiro-kit-dev` | TypeScript CLI, pnpm monorepo | Developing Kiro-Kit itself |

Every preset is self-contained: agents, skills, commands, cross-platform hooks,
workflows, statusline scripts, MCP templates, worked example specs, and Powers
recommendations.

Exact contents per preset — every command, agent, skill, hook, and example spec —
live in the **[preset reference](https://ihatesea69.github.io/kiro-kit/docs/reference)**,
generated from the shipped manifests on every docs build.

## Commands

| Command | What it does |
|---|---|
| `kiro-kit init` | Interactive preset picker and workspace bootstrap |
| `kiro-kit add <preset>` | Drop another preset into an existing workspace |
| `kiro-kit list` | See all presets with artifact counts |
| `kiro-kit info <preset>` | Detailed preset contents and file targets |
| `kiro-kit update` | Pull the latest preset version into your workspace |
| `kiro-kit restore` | Roll back from a timestamped backup |
| `kiro-kit doctor` | Health check, `--fix` auto-repairs |
| `kiro-kit spec new` | Scaffold a new spec from a template |
| `kiro-kit powers` | List and install Kiro Powers from the marketplace |
| `kiro-kit telemetry` | Manage opt-in usage telemetry (off by default) |

```
-y, --yes              Skip confirmation prompts
--preset <name>        Install a specific preset non-interactively
--force                Overwrite all conflicts (with backup)
--skip-existing        Skip files that already exist
--powers <mode>        Powers setup: none, all, or interactive (default)
--no-color             Disable ANSI output
--verbose              Verbose logging
--quiet                Errors only
--json                 Machine-readable output (list, info)
```

Full flag list: **[CLI reference](https://ihatesea69.github.io/kiro-kit/docs/guide/cli-reference)**.

## How it behaves

- **Bundled, not fetched.** Presets ship in the npm tarball, so `init` works
  offline after install.
- **Your files win.** Existing content is never silently overwritten — conflicts
  prompt, and every write is backed up first.
- **Atomic writes.** A temp file plus rename, so an interrupt cannot leave a
  half-written workspace.

## What you get

- **[Deep security scan](https://ihatesea69.github.io/kiro-kit/docs/features/deep-security-scan)** —
  a multi-agent, whole-repository security review that writes a findings
  workspace you can act on (`backend`, `fullstack`, `devops`, `sa`).
- **[Spec-driven development](https://ihatesea69.github.io/kiro-kit/docs/features/spec-driven-development)** —
  worked example specs plus steering that teaches the requirements → design →
  tasks flow with EARS acceptance criteria.
- **[Native Kiro Agent Hooks](https://ihatesea69.github.io/kiro-kit/docs/features/native-hooks)** —
  event-driven automation that runs inside the IDE, shipped disabled so nothing
  starts an agent run you did not ask for.
- **[MCP servers and Powers](https://ihatesea69.github.io/kiro-kit/docs/features/mcp-and-powers)** —
  `init` writes a working MCP config. Nothing that cannot start is left enabled:
  servers needing credentials or a missing toolchain ship `"disabled": true` with
  a reason, and `${WORKSPACE_ROOT}` is resolved at write time.

## Privacy

Telemetry is **off by default**. Nothing leaves your machine unless you opt in.

```bash
kiro-kit telemetry status
kiro-kit telemetry enable
kiro-kit telemetry disable
```

Opt-in events cover command name, preset selection, OS, and Node version — never
file contents, paths, or personal data.

## Requirements

Node.js 18 or later.

## Links

- Documentation: <https://ihatesea69.github.io/kiro-kit/>
- Repository: <https://github.com/ihatesea69/kiro-kit>
- Issues: <https://github.com/ihatesea69/kiro-kit/issues>
- Changelog: <https://github.com/ihatesea69/kiro-kit/blob/main/CHANGELOG.md>
- Kiro IDE: <https://kiro.dev>

## License

[MIT](https://github.com/ihatesea69/kiro-kit/blob/main/LICENSE)

<div align="center">

<img src="./assets/banner.png" alt="kiro-kit" width="100%" />

[![CI](https://img.shields.io/github/actions/workflow/status/ihatesea69/kiro-kit/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/ihatesea69/kiro-kit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![license](https://img.shields.io/npm/l/kiro-kit?style=flat-square)](./LICENSE)
[![downloads](https://img.shields.io/npm/dm/kiro-kit?style=flat-square)](https://www.npmjs.com/package/kiro-kit)
[![node](https://img.shields.io/node/v/kiro-kit?style=flat-square)](https://nodejs.org)

**[Documentation](https://ihatesea69.github.io/kiro-kit/)**

</div>

---

Kiro-Kit bootstraps an engineer-grade [Kiro](https://kiro.dev) workspace in one
command. Pick a preset for your stack and get agents, skills, commands, hooks,
MCP server config, Kiro Powers recommendations, and spec scaffolding written
straight into `.kiro/`. Every preset is self-contained, everything ships in the
npm tarball, and existing files are never silently overwritten.

## Quick Start

```bash
npx kiro-kit init
```

Pick from the interactive selector — arrow keys to move, Enter to select, Enter
again to confirm. Your `.kiro/` workspace is ready immediately.

```bash
# or install globally
npm install -g kiro-kit
kiro-kit init
```

## Documentation

Full documentation lives at **<https://ihatesea69.github.io/kiro-kit/>**.

| | |
|---|---|
| [Quick Start](https://ihatesea69.github.io/kiro-kit/docs/guide/quick-start) | Install and first workspace |
| [Preset Reference](https://ihatesea69.github.io/kiro-kit/docs/reference) | Every preset's commands, agents, skills, hooks, Powers, and example specs |
| [CLI Reference](https://ihatesea69.github.io/kiro-kit/docs/guide/cli-reference) | Every command and flag |
| [How It Works](https://ihatesea69.github.io/kiro-kit/docs/guide/how-it-works) | Lifecycle, merge semantics, conflict resolution, backups |
| [Features](https://ihatesea69.github.io/kiro-kit/docs/features/deep-security-scan) | Deep security scan, spec-driven development, MCP and Powers, native hooks |
| [Creating Presets](https://ihatesea69.github.io/kiro-kit/docs/guide/creating-presets) | Author your own preset |

The reference section is generated from the preset manifests on every docs
build, so its catalogs and counts are always what actually ships.

## Design principles

- **Bundled, not fetched** — all presets ship in the npm tarball. Works offline
  after install.
- **User-priority merge** — existing user content is never silently overwritten.
  Conflicts always prompt.
- **Atomic writes** — temp file plus rename guarantees no partial state on crash
  or interrupt.
- **Self-contained presets** — installing one never requires another; removing
  one has no side effects.

## Privacy

Telemetry is **off by default** and no data leaves your machine unless you opt
in with `kiro-kit telemetry enable`. See the
[CLI reference](https://ihatesea69.github.io/kiro-kit/docs/guide/cli-reference#privacy-and-telemetry).

## Contributing

Got an idea for a new preset, or want to improve an existing one? See
[CONTRIBUTING.md](./CONTRIBUTING.md) and
[Creating Presets](https://ihatesea69.github.io/kiro-kit/docs/guide/creating-presets).

```bash
git clone https://github.com/ihatesea69/kiro-kit.git
cd kiro-kit
pnpm install
pnpm test
```

## License

[MIT](./LICENSE)

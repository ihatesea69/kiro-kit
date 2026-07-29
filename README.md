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

Arrow keys to move, Enter to select, Enter again to confirm. That's it — the
workspace is ready when the command exits.

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

## How it behaves

- Presets ship inside the npm package. Nothing is fetched at install time, so it
  works offline.
- Your files win. If a file already exists with different content, you get a
  prompt, not an overwrite. Backups are written before anything is replaced.
- Writes go to a temp file and then get renamed, so a crash or Ctrl-C can't
  leave a half-written file behind.
- Presets are independent. Installing one never pulls in another, and removing
  one doesn't break the rest.

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

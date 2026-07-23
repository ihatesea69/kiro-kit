# kiro-kit-dev preset

A preset for **developing the Kiro-Kit CLI itself** — and, more broadly, for
building TypeScript ESM command-line tools in a pnpm monorepo.

## What you get

- **Steering** tuned for this repo: `kiro-kit-development` (build/test/version/publish),
  `preset-authoring` (manifest schema + the no-orphan invariant + thresholds),
  `cli-architecture` (core modules + the three invariants),
  `testing-strategy` (unit/property/structural), `typescript-cli-conventions`,
  and `spec-driven-development`.
- **Example specs** for meta-work: `add-new-preset`, `add-cli-command`,
  `spec-library-expansion` — each a full requirements/design/tasks trio.
- The shared engineer base: 19 agents, 24 skills, 66 commands, native + shell
  hooks, and workflows (inherited from the backend engineer preset).
- **Powers**: Context7 (docs), Snyk (security), Postman.

## Install

```bash
kiro-kit init --preset kiro-kit-dev
```

## Who it's for

Maintainers and contributors of Kiro-Kit, and anyone building a CLI with the same
stack (TypeScript, ESM, tsup, Vitest, Commander, Zod).

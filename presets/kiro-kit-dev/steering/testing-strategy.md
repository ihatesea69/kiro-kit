---
inclusion: always
description: Kiro-Kit testing strategy — unit, property (fast-check), and structural tests, plus how to run them and what each guards.
---

# Testing Strategy

Tests live in `packages/cli/tests/` and run with Vitest. The root
`vitest.config.ts` discovers `packages/**/tests/{unit,e2e,property,structural}`.

## Categories

- **unit** (`tests/unit/`) — fast tests for individual core modules
  (ManifestParser, ConflictResolver, PowerInstaller, mergeMCP, …). Assert exact
  behavior and edge cases.
- **property** (`tests/property/`) — `fast-check` generative tests for invariants:
  manifest round-trip, merge commutativity/idempotency, no-broken-link. Run ≥100
  iterations.
- **structural** (`tests/structural/`) — assertions over the shipped preset
  bundles: per-preset thresholds, no-orphan, no-broken-link, hook completeness,
  front-matter validity, skill discoverability, and the feature-expansion checks
  (native hooks valid, example specs complete with `.config.kiro`).

## Running

```bash
cd packages/cli
pnpm typecheck            # tsc --noEmit
pnpm test                # unit + property + structural (root config)
pnpm test:structural     # structural only
```

Note: `tests/unit/themed-prompt.test.ts` reads stdin and can hang in a non-TTY
shell — exclude it when running locally in a piped terminal
(`--exclude "**/themed-prompt.test.ts"`).

## Rules when changing code

- Touch a preset's files → reconcile its `manifest.json` (no-orphan will fail otherwise).
- Add a preset name → update every hardcoded `PRESETS` array in `tests/**`.
- Add a CLI command → add a unit test and keep typecheck green.
- Add example specs → each needs a `.config.kiro`; the feature-expansion test checks it.

Green bar = `typecheck` passes and all unit/property/structural tests pass. The
only tolerated pre-existing red is environment-specific (themed-prompt stdin).

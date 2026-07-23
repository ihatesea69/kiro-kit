---
inclusion: always
description: TypeScript + ESM + monorepo conventions for the Kiro-Kit CLI — imports, error handling, command style, and the build/release flow.
---

# TypeScript CLI Conventions

## Module system

- Package is ESM (`"type": "module"`). Use `import`/`export`.
- **Relative imports must include the `.js` extension** (e.g.
  `import { load } from '../core/PresetLoader.js'`) even though the source is
  `.ts` — required for Node ESM resolution after bundling.
- No default exports for modules; prefer named exports.

## Command style

Each command exports `register<Name>Command(program: Command)` and is wired in
`src/index.ts`. Inside:

- Parse options via Commander; keep an `interface <Name>Options`.
- Use `logger` (`utils/logger`) for messages and `color` (`utils/color`) for
  styling — never raw `console.log` in command output paths.
- Wrap the action in try/catch; on error `logger.error(...)` then
  `process.exit(1)`. Throw `KKError` (with an error code from `core/errors.ts`)
  for structured failures.

## Validation

Validate untrusted input (CLI args, file paths, JSON) at the boundary. Use Zod
schemas for structured config (`ManifestParser`, `PowersLoader`). Reject path
traversal with `utils/paths.safePathInside` and format regexes.

## Release flow

```bash
cd packages/cli
pnpm typecheck && pnpm test          # green bar
# bump version in packages/cli/package.json
pnpm build                            # tsup → dist/ + copy-presets → dist/presets
npm publish                           # (2FA OTP prompt; use --otp=<code> if needed)
```

Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`), end with
the `Co-Authored-By` trailer, and reference the version bump. Open a PR to `main`,
keep CI green, then squash-merge before publishing from `main`.

## Maintenance scripts (`scripts/`)

`generate-native-hooks.mjs`, `generate-powers.mjs`, `sync-preset-manifests.mjs`,
`prune-manifest-broken-links.mjs`, `register-example-specs.mjs`,
`install-powers.mjs`. These are Node ESM (`.mjs`), not shipped in the tarball —
avoid `*/` inside block comments (it closes the comment early).

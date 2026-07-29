# Contributing to kiro-kit

Thank you for your interest in contributing. This guide covers local setup,
testing, and the pull request process.

## Prerequisites

- Node.js >= 18
- pnpm >= 9

## Local Setup

```bash
git clone https://github.com/ihatesea69/kiro-kit.git
cd kiro-kit
pnpm install
pnpm build
```

## Development Commands

```bash
pnpm lint          # ESLint
pnpm typecheck     # TypeScript type checking
pnpm test          # All tests (unit, e2e, property, structural)
pnpm build         # Build CLI package
```

## Running Tests

### Unit Tests

```bash
cd packages/cli
pnpm test -- tests/unit/
```

### End-to-End Tests

```bash
cd packages/cli
pnpm test -- tests/e2e/
```

### Structural Tests

Validate preset shape invariants (minimum artifact counts, front-matter, hooks):

```bash
cd packages/cli
pnpm test -- tests/structural/
```

### Property-Based Tests

Verify universal correctness properties with fast-check:

```bash
cd packages/cli
pnpm test -- tests/property/
```

### Full Suite

```bash
pnpm test
```

## Project Structure

```
packages/cli/       CLI source code, tests, and build config
presets/            Preset content (agents, skills, commands, hooks, etc.)
docs/               Project documentation
```

## Making Changes

### Branch Naming

Create a branch from `main` with a descriptive prefix:

- `feat/add-rust-preset`
- `fix/manifest-parser-crash`
- `docs/update-architecture`
- `test/add-merge-property`

### Commit Conventions

Use conventional commit format:

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`, `ci`

Examples:

```
feat(cli): add --dry-run flag to init command
fix(merge): preserve user MCP servers during update
docs: add FAQ section for telemetry questions
test(property): add merge associativity property
```

### Pull Request Process

1. Ensure all checks pass locally:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

2. Push your branch and open a PR against `main`.

3. Fill in the PR template with:
   - Summary of changes
   - Related issue number (if applicable)
   - Testing performed
   - Breaking changes (if any)

4. Address review feedback. Maintainers may request changes before merging.

## Adding a New Preset

See [Creating Presets](https://ihatesea69.github.io/kiro-kit/docs/guide/creating-presets)
for the manifest schema, file conventions, and validation checklist.

## Reporting Issues

- Bugs: use the bug report issue template
- Feature requests: use the feature request template
- New preset ideas: use the preset request template

## Code of Conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).

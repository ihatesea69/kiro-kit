# Requirements Document

## Introduction

The kiro-kit CLI is a TypeScript ESM package built with tsup, distributed as the `kiro-kit` binary, and structured around Commander.js. Each subcommand lives in its own file under `packages/cli/src/commands/` and is wired into the root `Command` object in `packages/cli/src/index.ts` via a `register<Cmd>Command(program)` function. This spec covers everything a contributor needs to add a new `kiro-kit <cmd>` subcommand — from creating the command module and wiring it in `index.ts`, through adding any new error codes in `errors.ts`, writing unit tests, and updating the README commands table.

## Glossary

- **Commander** — the `commander` npm package used by kiro-kit to parse CLI arguments and dispatch subcommands (`import { Command } from 'commander'`).
- **register function** — the named export `register<Cmd>Command(program: Command): void` that each command module must export and that `index.ts` calls to attach the subcommand to the root `program`.
- **`logger`** — the shared logger utility at `packages/cli/src/utils/logger.ts`; provides `logger.info()`, `logger.error()`, `logger.warn()`, and `logger.verbose()`. All command output goes through `logger` or `process.stdout.write`, never `console.log`.
- **`color`** — the color utility at `packages/cli/src/utils/color.ts`; used to apply ANSI color to output text (e.g., `color.green('Done')`, `color.bold(name)`).
- **`KKError`** — the structured error class in `packages/cli/src/core/errors.ts`; carries a `code` (e.g., `KK100`), a `message`, and an optional `suggestion`. Commands catch `KKError` and call `logger.error(err.message)` then `process.exit(1)`.
- **`ErrorCodes`** — the `const` object in `packages/cli/src/core/errors.ts` exporting all error code strings; new commands add entries here if they introduce new failure modes.
- **tsup** — the bundler that compiles `packages/cli/src` to `packages/cli/dist/`; ESM output only.
- **vitest** — the test runner used across the monorepo; command unit tests live under `packages/cli/tests/unit/<cmd>.test.ts`.
- **global flag** — flags wired on the root `program` in `index.ts`: `--verbose`, `--quiet`, `--no-color`. The `preAction` hook applies them before any subcommand runs.

## Out of Scope

- Changing the global flag set (`--verbose`, `--quiet`, `--no-color`).
- Modifying Commander version or replacing Commander with another CLI framework.
- Adding interactive TUI prompts (those live under `packages/cli/src/prompts/`); this spec covers simple flag-driven commands only.
- Publishing a new npm package or modifying `package.json` `bin` entries.

## Requirements

### Requirement 1: Command Module Created with Correct Structure

**User Story:** As a kiro-kit contributor, I want to create a new command module at `packages/cli/src/commands/<cmd>.ts` that exports a `register<Cmd>Command(program: Command): void` function, so that the command integrates cleanly with the existing Commander-based architecture.

#### Acceptance Criteria

1. WHEN the new file `packages/cli/src/commands/<cmd>.ts` is created THE SYSTEM SHALL export a function named `register<Cmd>Command` (PascalCase of the command name) that accepts a single `program: Command` argument and returns `void`.
2. WHEN `register<Cmd>Command(program)` is called THE SYSTEM SHALL attach the new subcommand to `program` using `program.command('<cmd>')`, set a `.description(...)` string, define any options with `.option(...)`, and register an `.action(...)` handler.
3. WHEN the action handler throws a `KKError` THE SYSTEM SHALL call `logger.error(err.message)` and then `process.exit(1)`, matching the pattern used in all existing commands (`spec.ts`, `list.ts`, `doctor.ts`, etc.).
4. WHEN the action handler completes successfully THE SYSTEM SHALL write its primary output to `process.stdout.write(...)` or `logger.info(...)` and exit with code 0 (the default).
5. WHERE the command produces colored output THE SYSTEM SHALL use `color.*` helpers from `packages/cli/src/utils/color.ts` and NEVER embed raw ANSI escape codes directly.

### Requirement 2: Command Wired in `index.ts`

**User Story:** As a kiro-kit contributor, I want the new command to appear when a user runs `kiro-kit --help`, so that it is discoverable as part of the official CLI surface.

#### Acceptance Criteria

1. WHEN `import { register<Cmd>Command } from './commands/<cmd>.js'` is added to `packages/cli/src/index.ts` THE SYSTEM SHALL resolve without TypeScript errors.
2. WHEN `register<Cmd>Command(program)` is called inside `index.ts` after the existing `register*Command` calls THE SYSTEM SHALL attach the new subcommand to the root `program` object.
3. WHEN a user runs `kiro-kit --help` after the CLI is built THE SYSTEM SHALL list the new `<cmd>` subcommand with its description string in the commands section of the help output.
4. WHEN a user runs `kiro-kit <cmd> --help` THE SYSTEM SHALL display the command's own help text, including all registered options and their descriptions.
5. WHEN `pnpm -r build` is run after the wiring change THE SYSTEM SHALL complete with zero TypeScript compilation errors.

### Requirement 3: New Error Codes Declared in `errors.ts` (when applicable)

**User Story:** As a kiro-kit contributor, I want any new failure mode introduced by the command to have a dedicated error code in `ErrorCodes`, so that errors are uniquely identifiable in bug reports and CI logs.

#### Acceptance Criteria

1. WHEN the new command introduces a failure mode not covered by an existing `ErrorCodes` entry THE SYSTEM SHALL declare a new `KK<NNN>` constant in the `ErrorCodes` object in `packages/cli/src/core/errors.ts`, using the next available numeric slot.
2. WHEN the new error code is used in `new KKError(ErrorCodes.NEW_CODE, ...)` THE SYSTEM SHALL produce formatted output in the shape `[KK<NNN>] <message>\n  Suggestion: <suggestion>` when `err.format()` is called.
3. IF the new command's failure modes are fully covered by existing error codes THEN no change to `errors.ts` is required, and this requirement is satisfied vacuously.
4. WHEN `pnpm -r typecheck` is run after modifying `errors.ts` THE SYSTEM SHALL complete with zero TypeScript errors.

### Requirement 4: Unit Tests Cover All Action Paths

**User Story:** As a kiro-kit contributor, I want unit tests for the new command that cover the success path, each distinct failure path, and flag variations, so that regressions are caught immediately in CI.

#### Acceptance Criteria

1. WHEN a new test file `packages/cli/tests/unit/<cmd>.test.ts` is created and `pnpm test -- tests/unit/<cmd>.test.ts` is run THE SYSTEM SHALL complete with all tests passing and no skipped tests.
2. WHEN the success path is exercised in a test THE SYSTEM SHALL assert that `process.stdout.write` (or `logger.info`) was called with the expected output string and that `process.exit` was not called (or was called with code 0).
3. WHEN an expected error condition is triggered in a test THE SYSTEM SHALL assert that `logger.error` was called with the correct message and that `process.exit` was called with code 1.
4. WHEN each declared option (flag) is exercised in a test THE SYSTEM SHALL assert that the option changes the command's behavior as documented.
5. WHEN `pnpm test` (full suite) is run after adding the new test file THE SYSTEM SHALL pass all existing tests with zero regressions.

### Requirement 5: README Commands Table Updated

**User Story:** As a kiro-kit user discovering the CLI for the first time, I want to see the new command listed in the README commands table, so that I know it exists and what it does without having to run `kiro-kit --help`.

#### Acceptance Criteria

1. WHEN the repository root `README.md` is updated THE SYSTEM SHALL include a row for `kiro-kit <cmd>` in the commands reference table, with the command's name, its flags/arguments, and a one-sentence description matching the `.description()` string registered with Commander.
2. WHEN a user reads the README they SHALL be able to determine the command's purpose, its required arguments, and its available options without running the CLI.
3. IF the README does not yet have a commands table THEN one SHALL be created with a header row and rows for all existing commands before adding the new one.

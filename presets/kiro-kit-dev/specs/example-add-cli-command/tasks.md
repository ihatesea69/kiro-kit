# Implementation Plan: Add a CLI Command

## Overview

The plan adds the new command in three dependency-ordered phases: create the command module with its business logic, wire it into `index.ts`, then write tests and documentation. Error code additions and the README update are the final loose ends. Each phase produces a self-contained, compilable increment.

## Tasks

- [ ] 1. Create the command module
  - [ ] 1.1 Create `packages/cli/src/commands/<cmd>.ts` with the standard import block: `import { Command } from 'commander'`, `import process from 'node:process'`, `import { logger } from '../utils/logger.js'`, `import { color } from '../utils/color.js'`, and `import { KKError, ErrorCodes } from '../core/errors.js'`
  - [ ] 1.2 Define the options interface `interface <Cmd>Options { ... }` matching every flag the command will expose
  - [ ] 1.3 Implement the private `run<Cmd>(opts: <Cmd>Options): void` function containing all business logic; throw `new KKError(ErrorCodes.RELEVANT_CODE, message, suggestion)` for each expected failure mode
  - [ ] 1.4 Implement `export function register<Cmd>Command(program: Command): void` that calls `program.command('<cmd>').description('...').option(...).action((opts) => { try { run<Cmd>(opts) } catch (err) { logger.error(err instanceof Error ? err.message : String(err)); process.exit(1); } })`
  - [ ] 1.5 Run `pnpm -r typecheck` from the repo root and confirm zero TypeScript errors in the new file
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5_

- [ ] 2. Declare new error codes (if the command introduces new failure modes)
  - [ ] 2.1 Open `packages/cli/src/core/errors.ts` and identify the highest existing `KK<NNN>` number; the next available slot is used for the first new code
  - [ ] 2.2 Add one `const` entry per new failure mode to the `ErrorCodes` object, e.g., `NEW_FAILURE_MODE: 'KK<NNN>'`
  - [ ] 2.3 Run `pnpm -r typecheck` and confirm zero errors after the addition
  - [ ] 2.4 If no new failure modes exist that are not already covered by an existing `ErrorCodes` entry, skip this task (mark it complete with a note)
  - _Requirements: R3.1, R3.2, R3.4_

- [ ] 3. Wire the command into `index.ts`
  - [ ] 3.1 Open `packages/cli/src/index.ts` and add `import { register<Cmd>Command } from './commands/<cmd>.js'` to the imports block, following the alphabetical or logical order of the existing imports
  - [ ] 3.2 Add `register<Cmd>Command(program)` after the last existing `register*Command(program)` call in the wire-up section
  - [ ] 3.3 Run `pnpm -r typecheck` and confirm zero TypeScript errors
  - [ ] 3.4 Run `pnpm -r build` and confirm tsup compiles `dist/index.js` with zero errors
  - [ ] 3.5 Smoke-test: run `node packages/cli/dist/index.js --help` and verify the new `<cmd>` appears in the commands list with its description
  - [ ] 3.6 Smoke-test: run `node packages/cli/dist/index.js <cmd> --help` and verify the command's option flags and description are displayed correctly
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5_

- [ ] 4. Write unit tests
  - [ ] 4.1 Create `packages/cli/tests/unit/<cmd>.test.ts`; import `{ describe, it, expect, vi, beforeEach, afterEach }` from `'vitest'` and import `run<Cmd>` (if exported for testing) or the full command module
  - [ ] 4.2 Add a `beforeEach` block that stubs `process.exit` with `vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)` and spies on `process.stdout.write` and `logger.error`
  - [ ] 4.3 Add an `afterEach` block that calls `vi.restoreAllMocks()` to prevent spy state leaking between tests
  - [ ] 4.4 Write one `it` block for the **success path**: pass valid options to `run<Cmd>` and assert `process.stdout.write` (or `logger.info`) was called with an expected output substring and `process.exit` was not called with code 1
  - [ ] 4.5 Write one `it` block per **failure mode**: trigger each error condition, assert `process.exit` was called with `1`, assert `logger.error` was called with the correct message string
  - [ ] 4.6 Write one `it` block per **option flag** that changes behavior: exercise the flag-present and flag-absent paths separately
  - [ ] 4.7 Run `pnpm test -- tests/unit/<cmd>.test.ts` and confirm all tests pass with zero skips
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [ ] * 5. End-to-end verification (optional but recommended before PR)
  - [ ] * 5.1 Run `pnpm test` (full suite) and confirm all unit, property, and structural tests pass with zero regressions introduced by the new command module
  - [ ] * 5.2 Run the command with each documented flag combination against a real workspace to confirm the live output matches the design
  - _Requirements: R4.5_

- [ ] 6. Update documentation
  - [ ] 6.1 Open the repository root `README.md` and locate the commands reference table; add a row with columns: `Command`, `Description`, `Options` — filling in the new command's name, its `.description()` string, and all registered flags with their descriptions
  - [ ] 6.2 If the README does not yet contain a commands table, create one with a Markdown table header and rows for all existing commands (`init`, `add`, `list`, `info`, `update`, `restore`, `doctor`, `spec`, `powers`, `telemetry`) before adding the new row
  - _Requirements: R5.1, R5.2, R5.3_

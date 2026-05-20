# Tasks: cli-init-preset-selection-display Bugfix

## Task List

- [x] 1. Write exploratory tests (unfixed code)
  - [x] 1.1 Create test file `packages/cli/src/commands/init.multiPickPrompt.test.ts` with a stdout-capture helper and exploratory tests that assert the cursor-up escape sequence value equals the actual newline count from the first render — these tests MUST FAIL on unfixed code
  - [x] 1.2 Run the exploratory tests on unfixed code and confirm they fail, documenting the counterexample output

- [x] 2. Implement the fix
  - [x] 2.1 In `packages/cli/src/commands/init.ts`, inside `multiPickPrompt`'s `render()` function, compute `maxDescWidth` from `process.stdout.columns ?? 80` minus the fixed prefix width
  - [x] 2.2 Truncate each item's description to `maxDescWidth` characters (appending `…` when truncated) before passing it to `color.dim()`

- [x] 3. Write fix-checking tests (Property 1)
  - [x] 3.1 Add property-based tests that generate item lists where at least one description exceeds terminal width and assert the rendered line count always equals `items.length + 1`

- [x] 4. Write preservation-checking tests (Property 2)
  - [x] 4.1 Add property-based tests that generate item lists where all descriptions fit within terminal width and assert the rendered output is identical before and after the fix (line count equals `items.length + 1`, no truncation marker present)

- [x] 5. Write unit tests for edge cases
  - [x] 5.1 Test that `process.stdout.columns = undefined` falls back to 80 without crashing
  - [x] 5.2 Test that a description exactly at `maxDescWidth` is not truncated (no `…` appended)
  - [x] 5.3 Test that an empty description renders without error

- [x] 6. Run full test suite and verify
  - [x] 6.1 Run `cd packages/cli && npx vitest run` and confirm all new tests pass and no existing tests regress

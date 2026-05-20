# cli-init-preset-selection-display Bugfix Design

## Overview

The `multiPickPrompt` function in `packages/cli/src/commands/init.ts` re-renders the
interactive preset list by moving the cursor up a fixed number of lines
(`items.length + 1`) before overwriting. When any preset description is long enough
to wrap onto a second terminal row, the actual rendered height exceeds that fixed
count, so the cursor lands in the wrong position and subsequent writes corrupt the
display with truncated words and bleed-through text from adjacent options.

The fix is minimal: truncate each description to fit within the available terminal
column width before rendering, so every option always occupies exactly one row and
the fixed cursor-up count remains correct.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a preset description
  whose rendered length (including prefix characters) exceeds `process.stdout.columns`.
- **Property (P)**: The desired behavior when the bug condition holds — each option
  line occupies exactly one terminal row and the re-render cursor-up count equals the
  actual rendered line count.
- **Preservation**: All interactive behaviors (Space, Enter, `a`/`A`, arrow keys,
  `k`/`j`) and the rendering of short descriptions that must remain unchanged by the fix.
- **multiPickPrompt**: The function in `packages/cli/src/commands/init.ts` that
  renders the interactive preset selection UI.
- **renderedLineCount**: The total number of terminal rows written by one call to
  `render()` — currently always `items.length + 1` (header + one row per item).
- **prefixWidth**: The number of columns consumed by the fixed prefix before the
  description text: `"  > [x] name         - "` — approximately 22 characters.

## Bug Details

### Bug Condition

The bug manifests when any item's description, after prepending the fixed prefix
(`marker`, `check`, `name`, `" - "`), produces a string whose visible character
count exceeds `process.stdout.columns`. Node's `process.stdout.write` then wraps
the line, consuming an extra terminal row. The re-render logic does not account for
this extra row, so `\x1B[${items.length + 1}A` moves the cursor to the wrong line.

**Formal Specification:**
```
FUNCTION isBugCondition(item, terminalColumns)
  INPUT: item of type { name: string; description: string },
         terminalColumns of type number
  OUTPUT: boolean

  prefixWidth := 22   // "  > [x] name(padded)  - "
  visibleLength := prefixWidth + stripAnsi(item.description).length
  RETURN visibleLength > terminalColumns
END FUNCTION
```

### Examples

- Terminal width 80, description 70 chars → prefix(22) + desc(70) = 92 > 80 → **bug triggers**, line wraps, cursor-up overshoots by 1 row per wrapping item.
- Terminal width 80, description 55 chars → prefix(22) + desc(55) = 77 ≤ 80 → **no bug**, renders correctly.
- Terminal width 80, description 200 chars → wraps onto 3 rows → cursor-up undershoots by 2 rows per item.
- Terminal width undefined (non-TTY pipe) → `process.stdout.columns` is `undefined`; fix must handle this gracefully by falling back to a safe default (e.g. 80).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Space toggles the selection state of the item at the current cursor position.
- Enter resolves the promise with the names of all selected presets.
- `a` / `A` toggles all items selected or deselected.
- Up/down arrow keys and `k`/`j` move the cursor to the previous/next item.
- When stdin is not a TTY, the function returns an empty array immediately.
- When all descriptions are short enough to fit within the terminal width, the
  rendered output is byte-for-byte identical to the current behavior.

**Scope:**
All inputs where `isBugCondition` returns false for every item must be completely
unaffected by this fix. This includes:
- Any item list where every description fits within the terminal width.
- All keypress handling logic (no changes to the event handler).
- The header line and the `[x]`/`[ ]` marker rendering.

## Hypothesized Root Cause

Based on reading the source, the root cause is straightforward:

1. **Fixed cursor-up count**: `render()` always emits `\x1B[${items.length + 1}A`
   regardless of how many terminal rows were actually written. When a description
   wraps, the actual row count is higher, so the cursor lands mid-render.

2. **No description width guard**: The `desc` variable is written as-is with no
   truncation or width check. `process.stdout.write` wraps long lines silently.

3. **`\x1B[2K` clears only the current line**: The "clear line" escape is emitted
   once per item, but if the previous render of that item spanned two rows, only
   the first row is cleared, leaving the second row's content visible.

The simplest correct fix is to truncate `desc` so that `prefix + desc` never
exceeds `process.stdout.columns`, eliminating wrapping entirely and keeping the
fixed cursor-up count valid.

## Correctness Properties

Property 1: Bug Condition - Description Truncation Prevents Line Wrapping

_For any_ item list where at least one description causes `isBugCondition` to return
true (i.e., the raw description would exceed terminal width), the fixed `render()`
function SHALL truncate that description so the total visible length of the rendered
line does not exceed `process.stdout.columns`, ensuring each option occupies exactly
one terminal row.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Short Descriptions Render Unchanged

_For any_ item list where `isBugCondition` returns false for every item (all
descriptions fit within terminal width), the fixed `render()` function SHALL produce
output identical to the original function, preserving all existing rendering behavior
for short descriptions.

**Validates: Requirements 3.5**

## Fix Implementation

### Changes Required

**File**: `packages/cli/src/commands/init.ts`

**Function**: `multiPickPrompt` → inner `render()`

**Specific Changes**:

1. **Compute available description width**: Before the render loop, derive the
   maximum number of visible characters the description may occupy:
   ```
   const cols = process.stdout.columns ?? 80;
   const PREFIX_WIDTH = 22; // "  > [x] name(padded)  - "
   const maxDescWidth = Math.max(0, cols - PREFIX_WIDTH);
   ```

2. **Truncate description before rendering**: Replace the bare `desc` construction
   with a truncated version:
   ```typescript
   const rawDesc = items[i].description;
   const truncated = rawDesc.length > maxDescWidth
     ? rawDesc.slice(0, Math.max(0, maxDescWidth - 1)) + '…'
     : rawDesc;
   const desc = color.dim(`- ${truncated}`);
   ```

3. **No change to cursor-up logic**: Because truncation guarantees one row per item,
   `\x1B[${items.length + 1}A` remains correct and requires no modification.

4. **No change to keypress handlers**: All Space / Enter / `a` / arrow / `k`/`j`
   logic is untouched.

5. **Handle undefined columns**: The `?? 80` fallback ensures the fix works in
   non-TTY or piped contexts where `process.stdout.columns` may be `undefined`.

The change is confined to approximately 4 lines inside `render()`.

## Testing Strategy

### Validation Approach

Two-phase approach: first run exploratory tests on the unfixed code to confirm the
root cause, then verify the fix satisfies both correctness properties.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug on unfixed code and
confirm the cursor-up overshoot hypothesis.

**Test Plan**: Capture all bytes written to stdout during two consecutive renders
(simulating a navigation keypress). Parse the cursor-up escape sequence from the
second render and compare it to the actual number of `\n` characters written in the
first render.

**Test Cases**:
1. **Single long description**: One item with a 100-char description on an 80-column
   terminal — first render writes `items.length + 2` rows, second render's cursor-up
   is `items.length + 1` → undershoots by 1 (will fail on unfixed code).
2. **Multiple long descriptions**: Three items all with 100-char descriptions —
   cursor-up undershoots by 3 (will fail on unfixed code).
3. **Mixed lengths**: Some items short, some long — cursor-up undershoots by the
   count of wrapping items (will fail on unfixed code).
4. **All short descriptions**: All descriptions fit in 80 columns — cursor-up equals
   actual row count (should pass on unfixed code, confirms preservation baseline).

**Expected Counterexamples**:
- The cursor-up value in the second render is less than the actual newline count in
  the first render, confirming the fixed-count overshoot.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed render
produces exactly one terminal row per item.

**Pseudocode:**
```
FOR ALL items WHERE EXISTS item: isBugCondition(item, terminalColumns) DO
  output := captureStdout(() => render(items))
  actualRows := countNewlines(output)
  ASSERT actualRows = items.length + 1
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where no item triggers the bug condition, the
fixed render produces output identical to the original render.

**Pseudocode:**
```
FOR ALL items WHERE FOR ALL item: NOT isBugCondition(item, terminalColumns) DO
  ASSERT render_original(items) = render_fixed(items)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking
because description lengths and terminal widths form a large input space. Generating
random short descriptions across many terminal widths provides strong guarantees that
the truncation path is never entered when it should not be.

**Test Plan**: Capture stdout from both original and fixed render functions with
short-description inputs and assert byte equality.

**Test Cases**:
1. **Short description preservation**: Random descriptions all under `maxDescWidth`
   — output must be identical before and after fix.
2. **Exact-width description**: Description exactly `maxDescWidth` chars — no
   truncation should occur, output identical.
3. **Empty description**: Empty string — no truncation, output identical.

### Unit Tests

- Render with one long description: verify output line count equals `items.length + 1`.
- Render with all long descriptions: verify output line count equals `items.length + 1`.
- Render with `process.stdout.columns = undefined`: verify no crash, falls back to 80.
- Truncated description ends with `…` when over limit.
- Description exactly at limit is not truncated.

### Property-Based Tests

- Generate random item lists where all descriptions are shorter than
  `maxDescWidth`: rendered line count always equals `items.length + 1` (preservation).
- Generate random item lists where at least one description exceeds terminal width:
  rendered line count always equals `items.length + 1` (fix correctness).
- Generate random terminal widths (40–220) and random descriptions: rendered line
  count always equals `items.length + 1` regardless of width.

### Integration Tests

- Run `multiPickPrompt` end-to-end with a mocked stdin sequence (down arrow, space,
  enter) against items with long descriptions: verify the resolved array contains the
  correct preset name and no exception is thrown.
- Run with all-short descriptions and same key sequence: verify identical resolved
  value (regression check).
- Run with `isTTY = false`: verify empty array returned without rendering.

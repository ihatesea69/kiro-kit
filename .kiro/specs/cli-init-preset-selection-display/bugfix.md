# Bugfix Requirements Document

## Introduction

The `kiro-kit init` interactive preset selection prompt renders corrupted output when preset descriptions exceed the terminal width. Because each option line can wrap onto additional terminal rows, the re-render logic — which moves the cursor up by a fixed number of lines — overshoots or undershoots, causing descriptions to be truncated mid-word, text from adjacent lines to bleed into the wrong rows, and the selection cursor (`>`) to appear in the wrong position. The bug is purely a terminal rendering issue in the `multiPickPrompt` function inside `packages/cli/src/commands/init.ts`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a preset description is longer than the available terminal column width THEN the system allows the text to wrap onto the next terminal row, consuming more rows than the render logic accounts for.

1.2 WHEN the user navigates up or down through the preset list after a long description has wrapped THEN the system moves the cursor up by `items.length + 1` rows regardless of actual rendered height, causing it to land in the middle of a previously rendered option line.

1.3 WHEN the re-render overwrites lines after an incorrect cursor position THEN the system writes new option text on top of leftover characters from the previous render, producing garbled output such as truncated words and bleed-through text from other options.

### Expected Behavior (Correct)

2.1 WHEN a preset description is longer than the available terminal column width THEN the system SHALL truncate or wrap the description so that each option occupies exactly one terminal row.

2.2 WHEN the user navigates up or down through the preset list THEN the system SHALL move the cursor up by the exact number of rows that were rendered, so the re-render overwrites the previous output cleanly.

2.3 WHEN the re-render runs after any navigation or selection action THEN the system SHALL produce output where every option line is distinct, fully readable, and free of characters from other option lines.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user presses Space on a preset THEN the system SHALL CONTINUE TO toggle the selection state of that preset and re-render the list correctly.

3.2 WHEN the user presses Enter THEN the system SHALL CONTINUE TO resolve the promise with the names of all selected presets.

3.3 WHEN the user presses `a` or `A` THEN the system SHALL CONTINUE TO toggle all presets selected or deselected and re-render the list correctly.

3.4 WHEN the user presses the up or down arrow keys (or `k`/`j`) THEN the system SHALL CONTINUE TO move the cursor to the previous or next preset respectively.

3.5 WHEN preset descriptions are short enough to fit within the terminal width THEN the system SHALL CONTINUE TO render the prompt identically to the current behavior.

3.6 WHEN stdin is not a TTY THEN the system SHALL CONTINUE TO return an empty array without rendering the prompt.

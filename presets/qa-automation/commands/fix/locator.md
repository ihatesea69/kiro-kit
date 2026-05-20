---
description: Fix broken element locators in UI tests.
argument-hint:
  - test-file
---

Fix broken element locators by inspecting current DOM state and updating selectors.

## Process
1. Identify the broken locator from error messages
2. Inspect current DOM to find correct selector
3. Apply selector using priority: role > label > text > testId > CSS
4. Verify the test passes with updated locators

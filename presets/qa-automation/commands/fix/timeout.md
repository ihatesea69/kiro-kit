---
description: Fix timeout failures in tests by improving wait strategies.
argument-hint:
  - test-name
---

Fix timeout failures by implementing proper explicit wait strategies.

## Process
1. Identify what the test is waiting for
2. Determine why the timeout occurs
3. Implement proper explicit wait conditions
4. Verify the fix without arbitrary delays

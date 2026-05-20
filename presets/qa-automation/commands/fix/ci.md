---
description: Fix CI pipeline test failures that pass locally.
argument-hint:
  - pipeline-url-or-log
---

Fix tests that fail in CI but pass locally by analyzing environment differences.

## Process
1. Compare CI and local environments
2. Identify differences (timing, resources, configuration)
3. Apply environment-agnostic fix
4. Verify in both environments

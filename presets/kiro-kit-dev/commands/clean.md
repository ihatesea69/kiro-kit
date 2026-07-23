---
description: Clean build artifacts, caches, and temporary files
inclusion: manual
---

## Workflow
1. Remove `dist/` or `build/` output directory
2. Remove `node_modules/.cache` if present
3. Remove coverage reports
4. Remove Docker dangling images if applicable
5. Optionally remove `node_modules/` if `--full` flag passed
6. Report cleaned directories and freed space

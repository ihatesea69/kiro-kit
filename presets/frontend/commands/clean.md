---
description: Clean build artifacts, caches, and temporary files
inclusion: manual
---

## Workflow
1. Remove `node_modules/.cache`
2. Remove `.next/` build directory
3. Remove `dist/` output directory
4. Remove coverage reports
5. Optionally remove `node_modules/` if `--full` flag passed
6. Report cleaned directories and freed space

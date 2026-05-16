---
description: Clean build artifacts, caches, and temporary files
inclusion: manual
---

## Workflow
1. Remove `node_modules/.cache`
2. Remove `dist/` output directory
3. Remove `.terraform/` directories
4. Remove Docker dangling images and build cache
5. Remove coverage reports
6. Optionally remove `node_modules/` if `--full` flag passed
7. Report cleaned directories and freed space

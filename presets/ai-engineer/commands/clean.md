---
description: Clean build artifacts, caches, and temporary files from the project
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: all, options: all, cache, outputs, checkpoints)

## Workflow
1. Remove `__pycache__/` directories recursively
2. Remove `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`
3. If SCOPE includes outputs: remove `outputs/`, `results/`
4. If SCOPE includes checkpoints: remove `checkpoints/`, `mlruns/`
5. Remove `.ipynb_checkpoints/` directories
6. Report cleaned files and freed space


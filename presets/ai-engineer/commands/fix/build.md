---
description: Diagnose and fix build or dependency issues
inclusion: manual
argument-hint: "[error-context]"
---

## Arguments
CONTEXT: $1 (optional, error message or log snippet)

## Workflow
1. Check Python version compatibility
2. Verify virtual environment is active
3. Check for dependency conflicts with `pip check`
4. Resolve version conflicts in requirements
5. Rebuild if needed (`pip install -e .`)
6. Verify build with `python -c "import package_name"`


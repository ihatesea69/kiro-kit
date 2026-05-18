---
description: Validate pipeline configuration and data contracts
inclusion: manual
argument-hint: "[pipeline-config]"
---

## Arguments
CONFIG: $1 (required, path to pipeline config)

## Workflow
1. Parse pipeline YAML/JSON configuration
2. Validate DAG structure (no cycles, all refs resolve)
3. Check data source connectivity
4. Validate schema contracts between stages
5. Verify output paths are writable
6. Report validation results


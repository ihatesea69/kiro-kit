---
description: Build a data pipeline DAG from configuration
inclusion: manual
argument-hint: "[pipeline-config] [target]"
---

## Arguments
CONFIG: $1 (required, path to pipeline config YAML)
TARGET: $2 (default: all, specific pipeline stage to build)

## Workflow
1. Parse pipeline configuration
2. Validate DAG structure (no cycles)
3. Check data source availability
4. Generate pipeline code (Airflow DAG or script)
5. Run dry-run validation
6. Report pipeline structure and dependencies


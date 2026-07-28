---
description: Execute a data pipeline locally or trigger remote execution
inclusion: manual
argument-hint: "[pipeline-name] [mode]"
---

## Arguments
PIPELINE: $1 (required, pipeline name or config path)
MODE: $2 (default: local, options: local, dry-run, remote)

## Workflow
1. Load pipeline definition
2. If dry-run: validate inputs and print execution plan
3. If local: execute stages sequentially with logging
4. If remote: trigger execution on orchestrator (Airflow/Prefect)
5. Monitor progress and report stage completion
6. Report final status and output locations


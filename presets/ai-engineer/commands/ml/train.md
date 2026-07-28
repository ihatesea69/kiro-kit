---
description: Train a machine learning model with experiment tracking
inclusion: manual
argument-hint: "[config-path] [experiment-name]"
---

## Arguments
CONFIG: $1 (required, path to training config YAML/JSON)
EXPERIMENT: $2 (default: auto-generated from config)

## Workflow
1. Load training configuration
2. Initialize experiment tracking (MLflow/W&B)
3. Load and validate training data
4. Initialize model and optimizer
5. Run training loop with validation
6. Log metrics, parameters, and artifacts
7. Save best model checkpoint
8. Report final metrics and model location


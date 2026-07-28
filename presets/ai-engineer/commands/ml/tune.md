---
description: Run hyperparameter tuning with Optuna or grid search
inclusion: manual
argument-hint: "[config-path] [n-trials]"
---

## Arguments
CONFIG: $1 (required, path to tuning config)
TRIALS: $2 (default: 50, number of optimization trials)

## Workflow
1. Load tuning configuration with search spaces
2. Initialize Optuna study or grid search
3. Run optimization trials with cross-validation
4. Log all trials to experiment tracker
5. Report best parameters and score
6. Save best model and configuration


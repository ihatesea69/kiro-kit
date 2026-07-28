---
description: Evaluate a trained model on test data with comprehensive metrics
inclusion: manual
argument-hint: "[model-path] [test-data-path]"
---

## Arguments
MODEL: $1 (required, path to model checkpoint or MLflow run ID)
DATA: $2 (required, path to test dataset)

## Workflow
1. Load model from checkpoint or registry
2. Load and preprocess test data
3. Generate predictions
4. Compute metrics (accuracy, F1, AUC, RMSE as appropriate)
5. Generate confusion matrix and classification report
6. Save evaluation artifacts to `reports/`
7. Compare against baseline if available


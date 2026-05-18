---
name: experiment-tracking
description: Track ML experiments systematically with MLflow, W&B, or similar tools. Use when running experiments, comparing model versions, or managing reproducibility.
---

# Experiment Tracking

Activate this skill when managing ML experiments and reproducibility.

## When to Use

- Logging hyperparameters and metrics
- Comparing experiment runs
- Tracking model artifacts and versions
- Reproducing previous results
- Sharing experiment results with team

## Tools

- **MLflow**: Open-source, self-hosted
- **Weights & Biases**: Cloud-hosted, rich UI
- **DVC**: Git-based data/model versioning
- **Neptune.ai**: Metadata management

## Patterns

```python
import mlflow

mlflow.set_experiment("text-classification")

with mlflow.start_run(run_name="bert-base-lr3e5"):
    mlflow.log_params({
        "model": "bert-base-uncased",
        "lr": 3e-5,
        "epochs": 10,
        "batch_size": 32,
    })
    # Training...
    mlflow.log_metrics({"val_f1": 0.89, "val_loss": 0.34})
    mlflow.log_artifact("confusion_matrix.png")
    mlflow.transformers.log_model(model, "model")
```

## Rules

- Log everything: params, metrics, artifacts, environment
- Use meaningful run names and tags
- Track data versions alongside model versions
- Set random seeds and log them
- Never delete experiment history


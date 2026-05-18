---
name: ml-ops
description: Deploy, monitor, and manage ML models in production. Use when setting up model serving, experiment tracking, or ML infrastructure.
---

# MLOps

Activate this skill when deploying models or managing ML infrastructure.

## When to Use

- Deploying models to production endpoints
- Setting up experiment tracking (MLflow, W&B)
- Building model registries and versioning
- Implementing A/B testing for models
- Monitoring model drift and performance

## Core Tools

- **MLflow**: Experiment tracking, model registry
- **Weights & Biases**: Experiment visualization
- **BentoML/Ray Serve**: Model serving
- **DVC**: Data and model versioning
- **Evidently AI**: Model monitoring

## Patterns

```python
import mlflow

mlflow.set_experiment("classification_v2")
with mlflow.start_run():
    mlflow.log_params({"lr": 0.001, "epochs": 50})
    mlflow.log_metrics({"accuracy": 0.94, "f1": 0.91})
    mlflow.sklearn.log_model(model, "model")
```

## Rules

- Version everything: code, data, models, configs
- Automate training pipelines (no manual steps)
- Monitor prediction distributions for drift
- Implement rollback mechanisms for model updates
- Log all experiments, even failed ones


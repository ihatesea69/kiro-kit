---
inclusion: always
description: Machine learning patterns for experiment tracking, model lifecycle, data validation, and reproducibility.
---

# ML Patterns

## Experiment Tracking

- Log all hyperparameters, metrics, and artifacts
- Use MLflow or Weights and Biases for tracking
- Tag experiments with meaningful names and descriptions
- Record git commit hash with each run
- Store model configs as YAML alongside artifacts

## Reproducibility

- Set random seeds explicitly (numpy, torch, python random)
- Pin all dependency versions in lock files
- Use DVC for data versioning (large files outside git)
- Document hardware requirements (GPU type, memory)
- Store environment info with experiment results

## Data Validation

- Validate schema on data ingestion (pandera or great_expectations)
- Check for nulls, duplicates, and out-of-range values
- Monitor data drift between training and serving
- Log data statistics (mean, std, distribution) per feature
- Version datasets with checksums

## Model Lifecycle

```
Raw Data -> Preprocessing -> Feature Engineering -> Training -> Evaluation -> Registry -> Serving
```

- Separate training from inference code paths
- Use model registry for versioned model storage
- Implement A/B testing for model comparison
- Monitor model performance in production
- Set up automated retraining triggers

## Feature Engineering

- Build features as pure functions (input -> output)
- Document feature semantics and business meaning
- Use feature stores for shared feature computation
- Version feature definitions alongside model code
- Test feature pipelines with known transformations

## Evaluation

- Define metrics before training (not after)
- Use stratified splits for classification tasks
- Report confidence intervals, not just point estimates
- Test on held-out data never seen during development
- Check for bias across demographic groups
- Compare against meaningful baselines

## Configuration

- Use YAML or TOML for experiment configs
- Separate model config from infrastructure config
- Support config inheritance (base + override)
- Validate configs with pydantic or dataclasses
- Never hardcode hyperparameters in source code

## Error Handling

- Catch and log OOM errors with context
- Implement checkpointing for long training runs
- Graceful degradation on GPU unavailability
- Validate model outputs before serving (NaN check, range check)
- Alert on training divergence (loss explosion)

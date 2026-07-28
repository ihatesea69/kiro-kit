# Code Standards

## Python

- Target Python 3.10+ (use modern syntax: `match`, `|` unions)
- Type hints on all public functions and class methods
- Use `ruff` for linting and formatting
- Use `mypy` in strict mode for type checking
- Docstrings: Google style for all public APIs

## Project Structure

```
project-root/
  src/
    data/              Data loading and preprocessing
    features/          Feature engineering modules
    models/            Model definitions and training
    pipelines/         Pipeline orchestration
    utils/             Shared utilities
  notebooks/           Exploratory analysis (numbered)
  tests/
    unit/              Fast, isolated tests
    integration/       Pipeline integration tests
  configs/             YAML configuration files
  data/
    raw/               Immutable source data
    processed/         Cleaned, transformed data
    features/          Feature store outputs
  models/              Trained model artifacts
  reports/             Generated analysis reports
```

## Naming

- Files: snake_case (`feature_engineering.py`, `train_model.py`)
- Classes: PascalCase (`DataLoader`, `ModelTrainer`)
- Functions: snake_case (`load_dataset`, `compute_features`)
- Constants: UPPER_SNAKE_CASE (`BATCH_SIZE`, `LEARNING_RATE`)
- Configs: kebab-case YAML (`train-config.yaml`)

## Data Handling

- Never modify raw data files (immutable source)
- Document data transformations with comments
- Validate schemas at pipeline boundaries
- Handle missing values explicitly (never silently drop)
- Use `pathlib.Path` for all file paths

## ML Code

- Set random seeds for reproducibility (`seed_everything()`)
- Separate data loading, preprocessing, training, evaluation
- Log all experiments (params, metrics, artifacts)
- Use configuration files over hardcoded values
- Write tests for data transformations

## Testing

- Use `pytest` as test runner
- Colocate unit tests in `tests/unit/`
- Use fixtures for shared test data
- Test data transformations with known inputs/outputs
- Mark slow tests with `@pytest.mark.slow`
- Mark GPU tests with `@pytest.mark.gpu`

## Error Handling

- Use custom exceptions for domain errors
- Validate inputs at function boundaries
- Log errors with context (data shape, config values)
- Fail fast on data quality issues
- Never silently swallow exceptions

## Git Conventions

- Conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `data`, `model`, `pipeline`, `docs`, `test`
- Branch naming: `feature/description`, `experiment/description`
- PR titles under 72 characters
- Include metrics in PR description for model changes

## Dependencies

- Pin exact versions in `requirements.txt`
- Use `pyproject.toml` for package metadata
- Separate dev dependencies from production
- Document CUDA/GPU requirements explicitly


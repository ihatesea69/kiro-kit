---
inclusion: always
description: Python coding conventions for data science and ML projects including typing, project structure, and dependency management.
---

# Python Conventions

## Project Structure

```
src/
  data/               Data loading and preprocessing
  features/           Feature engineering pipelines
  models/             Model definitions and training
  evaluation/         Metrics and evaluation logic
  pipelines/          Orchestration and DAGs
  utils/              Shared utilities
notebooks/            Jupyter notebooks (exploration only)
tests/                Test suite
data/
  raw/                Immutable raw data
  processed/          Cleaned and transformed data
  features/           Feature stores
models/               Serialized model artifacts
configs/              YAML/TOML configuration files
```

## Typing Rules

- Use type hints on all function signatures
- Use `typing` module for complex types (Optional, Union, Literal)
- Use `TypedDict` for structured dictionaries
- Prefer `list[str]` over `List[str]` (Python 3.10+)
- Use `numpy.typing.NDArray` for array annotations
- Use `pandas.DataFrame` type annotations where applicable

## Naming Conventions

- Modules: snake_case (`feature_engineering.py`)
- Classes: PascalCase (`DataPipeline`)
- Functions: snake_case (`compute_features`)
- Constants: UPPER_SNAKE_CASE (`MAX_EPOCHS`)
- Private: leading underscore (`_internal_helper`)
- Type aliases: PascalCase (`FeatureMatrix = NDArray[np.float64]`)

## Dependencies

- Use `pyproject.toml` for project metadata and dependencies
- Pin exact versions in production (`torch==2.1.0`)
- Use version ranges in libraries (`numpy>=1.24,<2.0`)
- Separate dev dependencies from production
- Use `uv` or `pip-tools` for lock files

## Code Style

- Follow PEP 8 with 88-char line length (Black formatter)
- Use `ruff` for linting (replaces flake8, isort, pyflakes)
- Docstrings: Google style for all public functions
- Imports: stdlib, third-party, local (separated by blank lines)
- Prefer pathlib.Path over os.path
- Use dataclasses or pydantic for structured data

## Testing

- Use pytest as test runner
- Fixtures for shared test data and model instances
- Parametrize tests for multiple input scenarios
- Use hypothesis for property-based testing
- Test data transformations with known input/output pairs
- Mock external services (APIs, databases) in unit tests

## Notebooks

- Notebooks are for exploration and visualization only
- Production code must live in `src/` modules
- Clear outputs before committing notebooks
- Use `nbstripout` as pre-commit hook
- Number notebooks for ordering (`01-eda.ipynb`)

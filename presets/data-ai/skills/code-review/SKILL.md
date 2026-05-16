---
name: code-review
description: Review data science and ML code for correctness, performance, and best practices. Use when receiving feedback, completing features, or before merging.
---

# Code Review

Activate this skill when reviewing or receiving reviews on data/ML code.

## When to Use

- Reviewing data pipeline implementations
- Checking ML training code for correctness
- Validating data preprocessing logic
- Ensuring reproducibility of experiments
- Reviewing notebook-to-production conversions

## Checklist

### Data Quality
- Input validation and schema checks
- Missing value handling documented
- Data leakage prevention (train/test separation)

### ML Correctness
- Random seeds set for reproducibility
- Metrics computed on correct splits
- Hyperparameters documented and justified
- Baseline comparison included

### Code Quality
- Functions are testable and focused
- Magic numbers replaced with named constants
- Error handling for data edge cases
- Type hints on public functions

### Performance
- Vectorized operations over loops
- Appropriate data types (category, float32)
- Memory-efficient processing for large datasets

## Rules

- Prioritize correctness over style
- Flag potential data leakage immediately
- Verify metrics are computed correctly
- Check for hardcoded paths or credentials
- Ensure experiments are reproducible


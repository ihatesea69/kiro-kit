---
name: pandas-analysis
description: Data manipulation and analysis with pandas. Use when cleaning data, performing aggregations, merging datasets, or building analysis pipelines.
---

# Pandas Analysis

Activate this skill when working with tabular data using pandas.

## When to Use

- Cleaning and preprocessing datasets
- Performing groupby aggregations
- Merging and joining multiple DataFrames
- Time series manipulation
- Exploratory data analysis

## Patterns

```python
import pandas as pd

# Method chaining for clean pipelines
result = (
    df.pipe(clean_column_names)
    .query("revenue > 0")
    .assign(margin=lambda x: x.revenue - x.cost)
    .groupby("category")
    .agg(total_margin=("margin", "sum"), count=("margin", "size"))
    .sort_values("total_margin", ascending=False)
)
```

## Performance Tips

- Use `category` dtype for low-cardinality strings
- Prefer vectorized operations over `apply()`
- Use `read_csv(usecols=...)` to load only needed columns
- Consider `pyarrow` backend for large datasets
- Use `query()` over boolean indexing for readability

## Rules

- Always inspect data shape and dtypes first
- Handle missing values explicitly (never ignore NaN)
- Validate assumptions about uniqueness and cardinality
- Use `.copy()` to avoid SettingWithCopyWarning
- Document data transformations with comments


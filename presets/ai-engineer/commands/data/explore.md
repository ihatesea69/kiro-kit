---
description: Explore a dataset with automated EDA (shape, types, distributions, missing values)
inclusion: manual
argument-hint: "[file-path] [format]"
---

## Arguments
FILE: $1 (required, path to data file)
FORMAT: $2 (default: auto-detect, options: csv, parquet, json, excel)

## Workflow
1. Load dataset with appropriate reader (pandas)
2. Report shape, dtypes, memory usage
3. Compute missing value percentages per column
4. Generate descriptive statistics (numeric + categorical)
5. Identify potential data quality issues
6. Suggest next steps for cleaning or feature engineering


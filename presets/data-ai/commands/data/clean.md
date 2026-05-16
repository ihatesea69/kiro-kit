---
description: Clean a dataset by handling missing values, duplicates, and type issues
inclusion: manual
argument-hint: "[file-path] [strategy]"
---

## Arguments
FILE: $1 (required, path to data file)
STRATEGY: $2 (default: conservative, options: conservative, aggressive, custom)

## Workflow
1. Load dataset and assess data quality
2. Remove exact duplicate rows
3. Handle missing values based on strategy:
   - conservative: flag only, no imputation
   - aggressive: impute with median/mode, drop high-null columns
4. Fix data types (dates, numerics, categories)
5. Save cleaned dataset with suffix `_cleaned`
6. Report changes made


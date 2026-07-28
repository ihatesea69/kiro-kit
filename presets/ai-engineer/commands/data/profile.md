---
description: Generate a comprehensive data profiling report
inclusion: manual
argument-hint: "[file-path] [output-format]"
---

## Arguments
FILE: $1 (required, path to data file)
OUTPUT: $2 (default: html, options: html, json, markdown)

## Workflow
1. Load dataset with pandas
2. Generate profiling with ydata-profiling or custom analysis
3. Compute correlations, distributions, interactions
4. Identify high-cardinality columns and outliers
5. Save report to `reports/` directory
6. Summarize key findings


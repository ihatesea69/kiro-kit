---
description: Validate data quality using schema checks and expectations
inclusion: manual
argument-hint: "[file-path] [schema-path]"
---

## Arguments
FILE: $1 (required, path to data file)
SCHEMA: $2 (optional, path to schema/expectations file)

## Workflow
1. Load dataset and infer schema if not provided
2. Check for null values, duplicates, type mismatches
3. Validate value ranges and distributions
4. Check referential integrity if multiple tables
5. Report validation results with severity levels
6. Suggest fixes for common issues


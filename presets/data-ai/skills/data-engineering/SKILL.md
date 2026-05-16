---
name: data-engineering
description: Design and implement data pipelines, ETL processes, and data infrastructure. Use when building data ingestion, transformation, or storage systems.
---

# Data Engineering

Activate this skill when designing data pipelines or working with data infrastructure.

## When to Use

- Building ETL/ELT pipelines
- Designing data warehouse schemas
- Implementing streaming data processing
- Optimizing data storage and retrieval
- Setting up data quality checks

## Core Tools

- **Apache Airflow**: Workflow orchestration
- **dbt**: SQL-based transformations
- **Apache Spark/PySpark**: Distributed processing
- **DVC**: Data version control
- **Great Expectations**: Data validation

## Patterns

```python
# Airflow DAG pattern
from airflow import DAG
from airflow.operators.python import PythonOperator

with DAG("etl_pipeline", schedule="@daily") as dag:
    extract = PythonOperator(task_id="extract", python_callable=extract_fn)
    transform = PythonOperator(task_id="transform", python_callable=transform_fn)
    load = PythonOperator(task_id="load", python_callable=load_fn)
    extract >> transform >> load
```

## Rules

- Idempotent operations (safe to re-run)
- Schema validation at pipeline boundaries
- Incremental processing over full reloads when possible
- Monitor data freshness and quality metrics
- Version control data schemas alongside code


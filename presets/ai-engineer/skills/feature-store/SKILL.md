---
name: feature-store
description: Design and manage feature stores for ML systems. Use when building reusable feature pipelines, managing feature versioning, or serving features for inference.
---

# Feature Store

Activate this skill when working with feature engineering at scale.

## When to Use

- Building reusable feature computation pipelines
- Managing feature versioning and lineage
- Serving features for online inference
- Sharing features across ML models
- Ensuring training-serving consistency

## Tools

- **Feast**: Open-source feature store
- **Hopsworks**: Full-featured platform
- **Custom**: pandas + SQL + caching

## Patterns

```python
from feast import FeatureStore, Entity, FeatureView

store = FeatureStore(repo_path="feature_repo/")

# Define features
user_features = FeatureView(
    name="user_features",
    entities=[user_entity],
    schema=[
        Field(name="total_purchases", dtype=Int64),
        Field(name="avg_order_value", dtype=Float64),
    ],
    source=user_source,
)

# Retrieve for training
training_df = store.get_historical_features(
    entity_df=entity_df,
    features=["user_features:total_purchases"],
).to_df()
```

## Rules

- Compute features once, use everywhere
- Version features alongside model versions
- Monitor feature distributions for drift
- Document feature semantics and business logic
- Test feature pipelines with known inputs


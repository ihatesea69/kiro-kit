---
name: scikit-learn
description: Classical machine learning with scikit-learn. Use when building classification, regression, clustering models, or implementing feature engineering pipelines.
---

# Scikit-learn

Activate this skill when working with classical ML algorithms.

## When to Use

- Building classification or regression models
- Feature engineering and selection
- Implementing ML pipelines with preprocessing
- Cross-validation and hyperparameter tuning
- Clustering and dimensionality reduction

## Patterns

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), numeric_features),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
])

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", GradientBoostingClassifier(n_estimators=200)),
])

scores = cross_val_score(pipeline, X, y, cv=5, scoring="f1_macro")
```

## Rules

- Always split data before any preprocessing
- Use pipelines to prevent data leakage
- Cross-validate before reporting metrics
- Start simple (LogisticRegression) before complex models
- Document feature engineering decisions


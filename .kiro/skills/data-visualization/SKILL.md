---
name: data-visualization
description: Create effective data visualizations with matplotlib, seaborn, and plotly. Use when building charts, dashboards, or communicating data insights visually.
---

# Data Visualization

Activate this skill when creating charts, plots, or visual data presentations.

## When to Use

- Creating exploratory data analysis plots
- Building publication-quality figures
- Designing interactive dashboards
- Communicating model results visually
- Comparing distributions and relationships

## Libraries

- **matplotlib**: Foundation, full control
- **seaborn**: Statistical visualization, clean defaults
- **plotly**: Interactive charts, dashboards
- **altair**: Declarative, grammar of graphics

## Patterns

```python
import matplotlib.pyplot as plt
import seaborn as sns

fig, axes = plt.subplots(1, 2, figsize=(12, 5))
sns.histplot(data=df, x="value", hue="category", ax=axes[0])
sns.scatterplot(data=df, x="feature_1", y="target", ax=axes[1])
plt.tight_layout()
plt.savefig("analysis.png", dpi=150, bbox_inches="tight")
```

## Rules

- Always label axes and add titles
- Use colorblind-friendly palettes
- Choose chart type based on data relationship
- Keep visualizations simple and focused
- Save figures at appropriate resolution (150+ DPI)
- Include units in axis labels


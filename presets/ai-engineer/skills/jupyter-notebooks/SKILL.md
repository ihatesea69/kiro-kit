---
name: jupyter-notebooks
description: Work effectively with Jupyter notebooks for data exploration and analysis. Use when creating notebooks, converting formats, or establishing notebook best practices.
---

# Jupyter Notebooks

Activate this skill when working with Jupyter notebooks in data science workflows.

## When to Use

- Creating exploratory data analysis notebooks
- Converting notebooks to scripts or reports
- Establishing notebook conventions for teams
- Debugging notebook execution issues
- Setting up JupyterLab environments

## Best Practices

- Keep notebooks focused on one analysis question
- Use markdown cells for documentation between code
- Clear outputs before committing to version control
- Extract reusable code into `.py` modules
- Number sections for narrative flow

## Structure

```
notebooks/
  01-data-exploration.ipynb
  02-feature-engineering.ipynb
  03-model-training.ipynb
  04-evaluation.ipynb
  utils/
    __init__.py
    plotting.py
    preprocessing.py
```

## Tools

```bash
# Convert to script
jupyter nbconvert --to script notebook.ipynb

# Convert to HTML report
jupyter nbconvert --to html --no-input notebook.ipynb

# Run notebook headless
papermill input.ipynb output.ipynb -p param_name value
```

## Rules

- Never store secrets in notebooks
- Use parameterized notebooks for reproducibility
- Pin library versions in notebook headers
- Keep cell execution order linear (no jumping)
- Use nbstripout to clean outputs before commits


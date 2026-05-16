# Data-AI Preset

Python/ML and AI agent toolkit for data science, machine learning, and AI development workflows.

## Overview

This preset provides a comprehensive environment for data scientists, ML engineers, and AI developers working with Python-based ML/AI stacks including PyTorch, TensorFlow, scikit-learn, pandas, and Google ADK.

## Included Artifacts

- 20 agents (16 baseline + 4 data-ai specific)
- 21 skills (including document-skills sub-skill container)
- 29 commands (25 baseline + 4 data-ai specific)
- 6 hooks (cross-platform)
- 4 workflows
- Statusline triple (js/sh/ps1)
- MCP server configurations
- Spec and docs templates

## Data-AI Specific Agents

- `data-scientist` - Statistical analysis, EDA, feature engineering
- `ml-engineer` - Model training, optimization, deployment
- `data-pipeline-architect` - ETL/ELT pipelines, data orchestration
- `model-evaluator` - Model validation, metrics, bias detection

## Data-AI Specific Skills

- `google-adk-python` - Google AI Development Kit for Python agents
- `ai-multimodal` - Multimodal AI processing (vision, audio, text)
- `document-skills` - Sub-skill container (docx, pdf, pptx, xlsx)
- `research` - Technical research and analysis
- `repomix` - Repository packaging for AI context
- `sequential-thinking` - Structured problem decomposition

## Usage

```bash
npx kiro-kit init --preset data-ai
```

## MCP Servers

- filesystem - Local file access
- git - Repository operations
- docs-seeker - Documentation search
- jupyter - Notebook server integration
- fetch - HTTP fetching

## Recommended Stack

- Python 3.10+
- PyTorch / TensorFlow / JAX
- pandas / polars / numpy
- scikit-learn / XGBoost
- MLflow / Weights & Biases
- DVC for data versioning
- Google ADK for AI agents

---
description: Bootstrap the data/ML project with Python environment and dependencies
inclusion: manual
argument-hint: "[environment]"
---

## Arguments
ENVIRONMENT: $1 (default: development)

## Workflow
1. Create virtual environment with `python -m venv .venv` or check conda env
2. Install dependencies from `requirements.txt` or `pyproject.toml`
3. Copy environment files from `.env.example` to `.env`
4. Verify GPU availability with `python -c "import torch; print(torch.cuda.is_available())"`
5. Run `python -m pytest --co` to verify test discovery
6. Report setup status


---
description: Deploy a trained model to a serving endpoint
inclusion: manual
argument-hint: "[model-path] [target]"
---

## Arguments
MODEL: $1 (required, path to model or registry URI)
TARGET: $2 (default: local, options: local, docker, cloud)

## Workflow
1. Load and validate model artifact
2. Generate serving configuration (BentoML/FastAPI/TF Serving)
3. If docker: build container image with model
4. If cloud: push to model registry and deploy endpoint
5. Run smoke test against endpoint
6. Report endpoint URL and health status


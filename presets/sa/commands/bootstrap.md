---
description: Bootstrap the project from scratch with dependencies and infrastructure setup
inclusion: manual
argument-hint: "[environment]"
---

## Arguments
ENVIRONMENT: $1 (default: development)

## Workflow
1. Install dependencies with `pnpm install` or `npm install`
2. Copy environment files from `.env.example` to `.env`
3. Verify Docker and docker-compose are available
4. Run `terraform init` if infrastructure directory exists
5. Verify setup with build command
6. Report status

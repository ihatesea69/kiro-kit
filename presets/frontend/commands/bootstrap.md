---
description: Bootstrap the project from scratch with dependencies and configuration
inclusion: manual
argument-hint: "[environment]"
---

## Arguments
ENVIRONMENT: $1 (default: development)

## Workflow
1. Install dependencies with `pnpm install` or `npm install`
2. Copy environment files from `.env.example` to `.env.local`
3. Run database migrations if applicable
4. Verify setup with `next build` or `tsc --noEmit`
5. Report status

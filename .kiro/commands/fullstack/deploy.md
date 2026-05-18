---
description: Deploy the application to production or preview environment
inclusion: manual
argument-hint: "[environment]"
---

## Arguments
ENVIRONMENT: $1 (default: preview, options: preview, production)

## Workflow
1. Run full test suite and verify passing
2. Run build to verify no errors
3. If preview: deploy to preview URL (Vercel preview, etc.)
4. If production: verify branch is main, deploy with production flag
5. Run database migrations if pending
6. Verify deployment health check
7. Report deployment URL and status

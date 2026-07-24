---
description: Deploy application to target environment using configured deployment strategy
inclusion: manual
argument-hint: "[environment] [strategy]"
---

## Arguments
ENVIRONMENT: $1 (required, options: dev, staging, production)
STRATEGY: $2 (default: rolling, options: rolling, blue-green, canary)

## Workflow
1. Verify build artifacts exist and are current
2. Run pre-deployment checks (tests, security scan)
3. Execute deployment using configured strategy
4. Run post-deployment smoke tests
5. Verify health checks pass
6. Report deployment status and rollback instructions

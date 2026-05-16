---
description: Auto-fix linting errors across the project
inclusion: manual
---

## Workflow
1. Run ESLint with auto-fix: `npx eslint . --ext .ts,.tsx --fix`
2. Run Prettier format: `npx prettier --write .`
3. Report fixed issues and remaining errors
4. If errors remain, provide specific fix guidance

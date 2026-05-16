---
description: Run linting and formatting checks across the project
inclusion: manual
---

## Workflow
1. Run ESLint on source files: `npx eslint . --ext .ts,.js`
2. Run Prettier check: `npx prettier --check .`
3. Run TypeScript type check: `npx tsc --noEmit`
4. Report results with error counts and fix suggestions
5. If `--fix` flag passed, auto-fix what is possible

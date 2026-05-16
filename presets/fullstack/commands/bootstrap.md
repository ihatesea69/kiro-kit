---
description: Bootstrap the project from scratch with dependencies, database, and configuration
inclusion: manual
argument-hint: "[environment]"
---

## Arguments
ENVIRONMENT: $1 (default: development)

## Workflow
1. Install dependencies with `pnpm install` or `npm install`
2. Copy environment files from `.env.example` to `.env.local`
3. Run database migrations (`npx prisma migrate dev` or `npx drizzle-kit push`)
4. Generate database client (`npx prisma generate` if using Prisma)
5. Verify setup with `next build` or `tsc --noEmit`
6. Report status

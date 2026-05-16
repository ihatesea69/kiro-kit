---
description: Create and run a database migration
inclusion: manual
argument-hint: "[migration-name]"
---

## Arguments
NAME: $1 (required, descriptive name like "add-user-roles")

## Workflow
1. Detect ORM in use (Prisma or Drizzle)
2. If Prisma: update schema.prisma, run `npx prisma migrate dev --name $1`
3. If Drizzle: create migration file, run `npx drizzle-kit generate`
4. Verify migration applies cleanly
5. Generate updated client types
6. Report migration status and any warnings

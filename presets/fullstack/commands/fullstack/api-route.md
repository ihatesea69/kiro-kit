---
description: Generate a new API route handler with validation and error handling
inclusion: manual
argument-hint: "[resource-name] [methods]"
---

## Arguments
RESOURCE: $1 (required, e.g. "users", "products")
METHODS: $2 (default: "GET,POST")

## Workflow
1. Create route file at `src/app/api/$1/route.ts`
2. Add Zod validation schemas for request bodies
3. Implement specified HTTP methods with proper error handling
4. Add authentication middleware check
5. Create corresponding service layer function
6. Report created files and next steps

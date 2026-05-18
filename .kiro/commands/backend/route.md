---
description: Generate a new API route handler with validation, error handling, and tests
inclusion: manual
argument-hint: "[method] [path] [description]"
---

## Arguments
METHOD: $1 (required, options: get, post, put, patch, delete)
PATH: $2 (required, e.g. /api/v1/users/:id)
DESCRIPTION: $3 (optional, describes the endpoint purpose)

## Workflow
1. Determine route location based on project structure
2. Create route handler with proper HTTP method
3. Add request validation schema (Zod/Joi/Pydantic)
4. Implement error handling with structured responses
5. Add authentication middleware if route is protected
6. Create integration test file for the endpoint
7. Update API documentation if OpenAPI spec exists
8. Run typecheck to verify no errors

## Conventions
- Use layered architecture: handler -> service -> repository
- Validate all input at the handler layer
- Return consistent error response format
- Include proper HTTP status codes
- Add request logging with correlation ID

---
description: Generate a new middleware function for request processing pipeline
inclusion: manual
argument-hint: "[middleware-name] [type]"
---

## Arguments
NAME: $1 (required, kebab-case middleware name)
TYPE: $2 (default: general, options: general, auth, validation, logging, rate-limit)

## Workflow
1. Determine middleware location based on project structure
2. Create middleware file with proper signature for the framework
3. Implement core logic based on type:
   - auth: token verification, session check
   - validation: schema validation, sanitization
   - logging: request/response logging with correlation ID
   - rate-limit: sliding window or token bucket
4. Add error handling that passes to next error handler
5. Create unit test file for the middleware
6. Register middleware in application setup if global
7. Run typecheck to verify no errors

## Conventions
- Middleware should be single-responsibility
- Always call next() or send response (never hang)
- Handle errors by passing to error middleware
- Keep middleware stateless when possible
- Document middleware order dependencies

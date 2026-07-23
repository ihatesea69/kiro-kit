# Code Standards

## Language and Runtime

- Node.js 18+ with TypeScript strict mode
- Python 3.10+ with type hints
- Go 1.21+ with standard project layout

## Architecture

- Layered architecture: Controller -> Service -> Repository
- Dependency injection for testability
- Single responsibility per module
- Maximum 200 lines per file

## File Organization

```
src/
  config/              Configuration and environment
  controllers/         Route handlers (thin, delegation only)
  services/            Business logic
  repositories/        Data access layer
  middleware/          Request processing pipeline
  models/              Data models and schemas
  validators/          Input validation schemas
  errors/              Custom error classes
  utils/               Shared utilities
  types/               TypeScript type definitions
tests/
  unit/                Unit tests (no I/O)
  integration/         Database and API tests
  fixtures/            Test data and helpers
```

## Naming

- Files: kebab-case (`user-service.ts`, `auth-middleware.ts`)
- Classes: PascalCase (`UserService`, `AuthMiddleware`)
- Functions: camelCase (`createUser`, `validateToken`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`, `DB_POOL_SIZE`)
- Database tables: snake_case plural (`user_accounts`)
- Database columns: snake_case (`created_at`, `email_verified`)
- API paths: kebab-case plural (`/api/v1/user-accounts`)
- Environment variables: UPPER_SNAKE_CASE (`DATABASE_URL`)

## Error Handling

- Use typed error classes with error codes
- Never swallow errors silently
- Log errors with context (correlation ID, user ID, operation)
- Return structured error responses to clients
- Use try-catch at service boundaries

## Database

- Use parameterized queries exclusively (no string concatenation)
- Implement connection pooling
- Add indexes based on query patterns
- Use transactions for multi-statement operations
- Include created_at/updated_at on all tables

## Testing

- Colocate test files or use parallel test directory
- Unit tests for business logic (no database, no network)
- Integration tests for API endpoints and database operations
- Use factories for test data (not raw fixtures)
- Test error paths, not just happy paths

## Security

- Validate all input at the boundary
- Hash passwords with bcrypt or argon2id
- Use parameterized queries (prevent SQL injection)
- Set security headers on all responses
- Never log sensitive data (passwords, tokens, PII)

## Git Conventions

- Conventional commits: `type(scope): description`
- Branch naming: `feature/description`, `fix/description`
- PR titles under 72 characters
- Squash merge to main

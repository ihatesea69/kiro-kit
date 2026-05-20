---
name: backend-development
description: >-
  Build robust backend systems with Node.js, Python, or Go. Use when
  implementing APIs, services, middleware, or server-side logic following
  production-grade patterns.
license: MIT
version: 1.0.0
---

# Backend Development

Activate this skill when building backend services, APIs, or server-side logic.

## When to Use

- Implementing REST or GraphQL API endpoints
- Building middleware (auth, logging, rate limiting, CORS)
- Designing service layer architecture
- Integrating with databases and external services
- Implementing background jobs and queues
- Setting up application configuration and environment management

## Architecture Patterns

- Layered: Controller -> Service -> Repository
- Clean Architecture: separate domain from infrastructure
- CQRS: separate read and write models for complex domains
- Event-driven: pub/sub for decoupled services

## Implementation Guidelines

- Validate all input at the boundary (controller/handler layer)
- Use dependency injection for testability
- Implement structured logging with correlation IDs
- Handle errors at appropriate layers (do not swallow exceptions)
- Use environment variables for configuration (12-factor app)
- Implement health check endpoints (/health, /ready)
- Use connection pooling for database connections
- Implement graceful shutdown handling

## Error Handling

- Use typed error classes with error codes
- Return consistent error response format
- Log errors with context (request ID, user ID, operation)
- Never expose internal details in production error responses
- Implement global error handler as safety net

## Testing Strategy

- Unit tests for service/business logic (no I/O)
- Integration tests for database and external service interactions
- API tests for endpoint behavior verification
- Load tests for performance-critical paths

---
name: backend-development
description: >-
  Build backend systems with modern technologies, APIs, authentication, and
  security best practices. Use when implementing server-side logic or API
  endpoints.
license: MIT
version: 1.0.0
---

# Backend Development

Activate this skill when building or modifying backend systems.

## When to Use

- Implementing API endpoints (REST, GraphQL, gRPC)
- Setting up authentication and authorization
- Configuring middleware and request pipelines
- Optimizing database queries and connections
- Implementing background jobs and queues
- Setting up caching strategies

## Practices

- Input validation on all external data
- Proper error handling with meaningful status codes
- Rate limiting and request throttling
- Structured logging with correlation IDs
- Health check endpoints for monitoring
- Graceful shutdown handling

## Rules

- Never trust client input -- validate and sanitize
- Use parameterized queries for all database access
- Store secrets in environment variables or secret managers
- Implement proper CORS configuration
- Use HTTPS for all external communication
- Follow REST conventions for API design
- Document API contracts (OpenAPI/Swagger)

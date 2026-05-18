---
inclusion: always
description: API design conventions for RESTful services, error handling, versioning, and request/response patterns.
---

# API Design Conventions

## URL Structure

- Use plural nouns for resource collections: `/users`, `/orders`, `/products`
- Use path parameters for resource identifiers: `/users/:id`
- Use query parameters for filtering, sorting, pagination: `/users?role=admin&sort=name&page=2`
- Nest sub-resources one level deep maximum: `/users/:id/orders`
- Use kebab-case for multi-word paths: `/order-items`
- Version APIs in the URL path: `/api/v1/users`

## HTTP Methods

- GET: retrieve resources (idempotent, cacheable)
- POST: create new resources
- PUT: full replacement of a resource
- PATCH: partial update of a resource
- DELETE: remove a resource (idempotent)

## Response Format

All responses use a consistent envelope:

```json
{
  "data": {},
  "meta": { "page": 1, "total": 100 },
  "errors": []
}
```

## Error Responses

Use standard HTTP status codes with structured error bodies:

```json
{
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "Email is required",
      "field": "email"
    }
  ]
}
```

Status code mapping:
- 400: validation errors, malformed request
- 401: missing or invalid authentication
- 403: authenticated but not authorized
- 404: resource not found
- 409: conflict (duplicate, state mismatch)
- 422: unprocessable entity (business logic rejection)
- 429: rate limit exceeded
- 500: unexpected server error

## Pagination

Use cursor-based pagination for large datasets, offset-based for simple cases:

```
GET /api/v1/users?limit=20&cursor=abc123
```

Response includes pagination metadata:
```json
{
  "data": [],
  "meta": {
    "hasNext": true,
    "nextCursor": "def456",
    "total": 1500
  }
}
```

## Naming Conventions

- Request/response bodies: camelCase for JSON fields
- Database columns: snake_case
- URL paths: kebab-case
- Query parameters: camelCase
- Headers: Title-Case (X-Request-Id)

## Authentication

- Use Bearer tokens in Authorization header
- Short-lived access tokens (15-60 minutes)
- Refresh tokens for session renewal
- API keys for service-to-service communication
- Never pass credentials in URL query parameters

## Validation

- Validate all input at the controller/handler layer
- Use schema validation libraries (Zod, Joi, Pydantic)
- Return all validation errors at once (not one at a time)
- Sanitize input to prevent injection attacks
- Set reasonable limits on string lengths and array sizes

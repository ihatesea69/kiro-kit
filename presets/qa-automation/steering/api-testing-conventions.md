---
inclusion: manual
description: Conventions for API test automation including request/response validation, authentication, schema checking, and error scenario coverage.
---

# API Testing Conventions

## Request Construction

- Use descriptive variable names for request data
- Store base URLs in configuration, not inline
- Build request bodies from data factories
- Include proper content-type headers
- Handle authentication tokens via environment variables

## Response Validation

Every API test must validate:

1. Status code matches expected
2. Response body structure is correct
3. Required fields are present with correct types
4. Business logic constraints are satisfied
5. Headers include expected values (CORS, cache, etc.)

## Authentication Testing

- Test with valid credentials (happy path)
- Test with expired tokens (401)
- Test with insufficient permissions (403)
- Test with malformed tokens (401)
- Never store real credentials in test code

## Error Scenarios

- 400: malformed request body, missing required fields
- 401: missing or invalid authentication
- 403: valid auth but insufficient permissions
- 404: non-existent resources
- 409: conflict (duplicate creation)
- 422: validation failures
- 429: rate limiting
- 500: server error (if reproducible)

## Schema Validation

- Validate response against OpenAPI/JSON Schema
- Check required vs optional fields
- Verify enum values
- Test nullable fields
- Validate nested object structures

## Test Organization

- Group by endpoint or resource
- Order: CRUD operations, then edge cases
- Use before/after hooks for auth setup
- Share request builders across related tests
- Keep assertions close to the action being tested

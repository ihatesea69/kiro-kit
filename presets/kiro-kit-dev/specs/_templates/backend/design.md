# Design: [Feature Name]

## Architecture

### System Context

Describe how this feature fits into the overall system architecture.

### Component Design

```
[Controller/Handler Layer]
  -> [Service/Business Logic Layer]
    -> [Repository/Data Access Layer]
      -> [Database]
```

### Data Flow

Describe request lifecycle:
- Request validation and parsing
- Authentication and authorization
- Business logic execution
- Data persistence
- Response formatting

## API Design

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/[resource] | List resources |
| POST | /api/v1/[resource] | Create resource |
| GET | /api/v1/[resource]/:id | Get resource |
| PUT | /api/v1/[resource]/:id | Update resource |
| DELETE | /api/v1/[resource]/:id | Delete resource |

### Request/Response Schemas

```typescript
interface CreateResourceRequest {
  // Define request body
}

interface ResourceResponse {
  // Define response shape
}
```

## Database Design

### Schema

```sql
CREATE TABLE [resource] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

- Primary query patterns and their index coverage
- Expected data volume and growth rate

## Error Handling Strategy

- Validation errors: 400 with field-level details
- Auth errors: 401/403 with minimal information
- Business logic errors: 409/422 with error codes
- Internal errors: 500 with correlation ID only

## Testing Strategy

- Unit tests: service layer logic, validation rules
- Integration tests: database operations, API endpoints
- Load tests: concurrent request handling, connection pooling

## Security Considerations

- Input validation approach
- Authentication mechanism
- Authorization model
- Data encryption requirements

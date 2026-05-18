# Design: [Feature Name]

## Architecture

### System Context

Describe how this feature fits into the Next.js application architecture.

### Component Design

```
[Client Components] <-> [Server Components]
  -> [Server Actions / API Routes]
    -> [Service Layer]
      -> [Repository / ORM]
        -> [Database]
```

### Data Flow

- Client interaction triggers Server Action or API call
- Input validated with shared Zod schema
- Service layer executes business logic
- Repository persists data via ORM
- Response flows back through layers
- Client updates via revalidation or optimistic update

## API Design

### Endpoints / Server Actions

| Method | Path / Action | Description |
|--------|--------------|-------------|
| GET | /api/v1/[resource] | List resources |
| POST | /api/v1/[resource] | Create resource |
| Server Action | create[Resource] | Form mutation |

### Schemas (Shared Zod)

```typescript
const createSchema = z.object({
  // Define shared validation
});
```

## Database Design

### Schema Changes

```prisma
model Resource {
  id        String   @id @default(cuid())
  // fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Frontend Design

### Component Tree

```
Page (Server Component)
  -> DataFetcher (Server Component, async)
    -> ClientInteraction (Client Component)
      -> Form (React Hook Form + Zod)
```

### State Management

- Server state: fetched in Server Components
- Form state: React Hook Form
- Optimistic updates: useOptimistic hook

## Testing Strategy

- Unit: service layer logic, Zod schemas, utility functions
- Integration: API routes with test database
- Component: React Testing Library for interactive components
- E2E: critical user flows with Playwright

## Security Considerations

- Input validation approach (shared Zod schemas)
- Authentication mechanism (middleware + session check)
- Authorization model (resource ownership)

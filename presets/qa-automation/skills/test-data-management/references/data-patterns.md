# Test Data Patterns

## Factory Pattern

Create test objects with sensible defaults and override capability:

```typescript
const createUser = (overrides = {}) => ({
  id: randomUUID(),
  name: 'Test User',
  email: 'test@example.com',
  role: 'viewer',
  ...overrides
});
```

## Fixture Strategy

- Shared fixtures: read-only reference data (countries, categories)
- Per-test fixtures: mutable data created and destroyed per test
- Snapshot fixtures: database snapshots for complex state

## Data Isolation

- Each test creates its own data
- Use unique identifiers to prevent collision
- Clean up after each test run
- Never depend on data from other tests

## Sensitive Data

- Use environment variables for credentials
- Mask PII in test data
- Never commit real user data to repositories
- Use data generators for realistic but fake data

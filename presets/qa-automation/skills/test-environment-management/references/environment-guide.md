# Test Environment Management Guide

Comprehensive reference for provisioning, configuring, and managing environments for automated testing.

---

## Environment Tiers

| Environment | Purpose | Stability | Data |
|-------------|---------|-----------|------|
| Local | Developer testing | Low | Synthetic |
| CI | Automated pipeline | Medium | Generated |
| QA/Staging | Manual + automated | High | Subset of production |
| Pre-production | Final validation | Very high | Production-like |
| Production | Smoke tests only | Critical | Real (read-only) |

---

## Docker-Based Test Environments

### Docker Compose for Local Testing

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  app:
    build:
      context: .
      target: test
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: test
      DATABASE_URL: postgres://test:test@postgres:5432/testdb
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 5s
      retries: 5
    tmpfs:
      - /var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  mailhog:
    image: mailhog/mailhog
    ports:
      - "8025:8025"
```

### Testcontainers (Programmatic)

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

let postgresContainer: any;
let redisContainer: any;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer('postgres:16')
    .withDatabase('testdb')
    .withUsername('test')
    .withPassword('test')
    .start();

  redisContainer = await new RedisContainer('redis:7')
    .start();

  process.env.DATABASE_URL = postgresContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();

  // Run migrations
  await runMigrations(process.env.DATABASE_URL);
}, 60000);

afterAll(async () => {
  await postgresContainer?.stop();
  await redisContainer?.stop();
});
```

---

## CI Environment Configuration

### GitHub Actions Services

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
      - run: npm test
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379
```

### Environment Variables Management

```typescript
// config/test.ts
export const testEnvConfig = {
  database: {
    url: process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '5'),
    logging: process.env.DB_LOGGING === 'true',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  app: {
    port: parseInt(process.env.PORT || '3000'),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },
  external: {
    mockExternalAPIs: process.env.MOCK_EXTERNAL !== 'false',
    emailProvider: process.env.EMAIL_PROVIDER || 'mailhog',
  },
};
```

---

## Service Mocking

### External API Mocks

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const handlers = [
  http.get('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json({
      data: [{ id: 'ch_test', amount: 2000, status: 'succeeded' }],
    });
  }),

  http.post('https://api.sendgrid.com/v3/mail/send', () => {
    return new HttpResponse(null, { status: 202 });
  }),

  http.get('https://maps.googleapis.com/maps/api/geocode/json', ({ request }) => {
    const url = new URL(request.url);
    const address = url.searchParams.get('address');
    return HttpResponse.json({
      results: [{ geometry: { location: { lat: 40.7128, lng: -74.0060 } } }],
      status: 'OK',
    });
  }),
];

export const mockServer = setupServer(...handlers);

beforeAll(() => mockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());
```

### WireMock for Java Services

```json
{
  "request": {
    "method": "GET",
    "urlPathPattern": "/api/v1/users/.*"
  },
  "response": {
    "status": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "jsonBody": {
      "id": "user-1",
      "name": "Test User",
      "email": "test@example.com"
    }
  }
}
```

---

## Environment Health Checks

### Readiness Verification Script

```typescript
// scripts/wait-for-env.ts
import { setTimeout } from 'timers/promises';

interface ServiceCheck {
  name: string;
  check: () => Promise<boolean>;
  timeout: number;
}

const services: ServiceCheck[] = [
  {
    name: 'Database',
    timeout: 30000,
    check: async () => {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      try {
        await client.connect();
        await client.query('SELECT 1');
        return true;
      } catch {
        return false;
      } finally {
        await client.end();
      }
    },
  },
  {
    name: 'Application',
    timeout: 60000,
    check: async () => {
      try {
        const res = await fetch(`${process.env.BASE_URL}/health`);
        return res.status === 200;
      } catch {
        return false;
      }
    },
  },
];

async function waitForServices() {
  for (const service of services) {
    const start = Date.now();
    let ready = false;

    while (Date.now() - start < service.timeout) {
      ready = await service.check();
      if (ready) break;
      await setTimeout(1000);
    }

    if (!ready) {
      throw new Error(`Service "${service.name}" not ready after ${service.timeout}ms`);
    }
    console.log(`[ready] ${service.name}`);
  }
}

waitForServices().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

---

## Environment Cleanup

### Teardown Scripts

```typescript
// globalTeardown.ts
export default async function globalTeardown() {
  // Stop application server
  if (global.__SERVER__) {
    await global.__SERVER__.close();
  }

  // Clean up database
  if (process.env.DATABASE_URL) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS test CASCADE');
    await client.end();
  }

  // Remove temporary files
  const { rm } = await import('fs/promises');
  await rm('./test-results', { recursive: true, force: true });
  await rm('./tmp/test-uploads', { recursive: true, force: true });
}
```

---

## Best Practices

- Use ephemeral environments that are created and destroyed per test run
- Never share mutable state between parallel test workers
- Prefer containerized services over shared remote instances
- Document environment prerequisites in the project README
- Keep environment configuration version-controlled
- Use health checks before running tests
- Isolate test environments from production networks

---

## References

- Testcontainers: https://testcontainers.com/
- Docker Compose: https://docs.docker.com/compose/
- MSW (Mock Service Worker): https://mswjs.io/
- WireMock: https://wiremock.org/
- GitHub Actions services: https://docs.github.com/en/actions/using-containerized-services

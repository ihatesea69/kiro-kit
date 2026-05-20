# Test Data Management Patterns

Comprehensive guide to creating, managing, and maintaining test data for reliable and repeatable automated tests.

---

## Core Principles

### Test Data Requirements

- **Isolation**: Each test operates on independent data
- **Determinism**: Same input always produces same output
- **Freshness**: Data is created/reset before each test run
- **Minimal**: Only create data needed for the specific test
- **Realistic**: Data resembles production patterns

---

## Factory Pattern

### TypeScript Factory with Faker

```typescript
import { faker } from '@faker-js/faker';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'moderator';
  createdAt: Date;
}

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  total: number;
  createdAt: Date;
}

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

// Factory functions with sensible defaults and overrides
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    role: 'user',
    createdAt: faker.date.recent({ days: 30 }),
    ...overrides,
  };
}

function createOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  const price = faker.number.float({ min: 5, max: 200, fractionDigits: 2 });
  return {
    productId: faker.string.uuid(),
    name: faker.commerce.productName(),
    quantity: faker.number.int({ min: 1, max: 5 }),
    price,
    ...overrides,
  };
}

function createOrder(overrides: Partial<Order> = {}): Order {
  const items = overrides.items || [createOrderItem(), createOrderItem()];
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    items,
    status: 'pending',
    total: Math.round(total * 100) / 100,
    createdAt: faker.date.recent({ days: 7 }),
    ...overrides,
  };
}
```

### Seeded Randomness

```typescript
import { faker } from '@faker-js/faker';

// Use consistent seed for reproducible test data
faker.seed(12345);

// Same data every time
const user1 = createUser(); // Always generates the same user
const user2 = createUser(); // Always generates the same second user

// Reset seed between test suites if needed
beforeEach(() => {
  faker.seed(Date.now()); // Random per test
});
```

---

## Builder Pattern

### Fluent Builder for Complex Objects

```typescript
class OrderBuilder {
  private order: Partial<Order> = {};
  private items: OrderItem[] = [];

  forUser(userId: string): this {
    this.order.userId = userId;
    return this;
  }

  withStatus(status: Order['status']): this {
    this.order.status = status;
    return this;
  }

  withItem(name: string, quantity: number, price: number): this {
    this.items.push({
      productId: faker.string.uuid(),
      name,
      quantity,
      price,
    });
    return this;
  }

  withRandomItems(count: number): this {
    for (let i = 0; i < count; i++) {
      this.items.push(createOrderItem());
    }
    return this;
  }

  createdDaysAgo(days: number): this {
    this.order.createdAt = new Date(Date.now() - days * 86400000);
    return this;
  }

  build(): Order {
    const items = this.items.length > 0 ? this.items : [createOrderItem()];
    return createOrder({ ...this.order, items });
  }
}

// Usage in tests
const order = new OrderBuilder()
  .forUser('user-123')
  .withStatus('shipped')
  .withItem('Widget', 2, 29.99)
  .withItem('Gadget', 1, 49.99)
  .createdDaysAgo(3)
  .build();
```

---

## Database Seeding

### Seed Scripts

```typescript
// seeds/test-scenarios.ts
import { db } from '../src/database';

export async function seedBasicScenario() {
  await db.transaction(async (tx) => {
    // Create users
    const admin = await tx.insert('users', createUser({ role: 'admin', email: 'admin@test.local' }));
    const buyer = await tx.insert('users', createUser({ role: 'user', email: 'buyer@test.local' }));

    // Create products
    const products = await Promise.all(
      Array.from({ length: 10 }, () => tx.insert('products', createProduct()))
    );

    // Create orders
    await tx.insert('orders', createOrder({
      userId: buyer.id,
      status: 'delivered',
      items: [{ productId: products[0].id, name: products[0].name, quantity: 1, price: products[0].price }],
    }));
  });
}

export async function clearTestData() {
  await db.transaction(async (tx) => {
    await tx.delete('order_items');
    await tx.delete('orders');
    await tx.delete('products');
    await tx.delete('users');
  });
}
```

### Per-Test Isolation with Transactions

```typescript
import { beforeEach, afterEach } from 'vitest';

let transaction: DatabaseTransaction;

beforeEach(async () => {
  transaction = await db.beginTransaction();
  // All test operations happen within this transaction
});

afterEach(async () => {
  // Rollback ensures no data persists between tests
  await transaction.rollback();
});
```

---

## API-Based Test Data

### Setup via API Calls

```typescript
import { test, expect, APIRequestContext } from '@playwright/test';

async function seedTestData(request: APIRequestContext) {
  // Create test user via admin API
  const userRes = await request.post('/api/admin/users', {
    data: createUser({ email: 'e2e-test@example.com' }),
    headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY },
  });
  const user = await userRes.json();

  // Create test products
  const products = await Promise.all(
    Array.from({ length: 5 }, () =>
      request.post('/api/admin/products', {
        data: createProduct(),
        headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY },
      }).then((r) => r.json())
    )
  );

  return { user, products };
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
  await seedTestData(request);
});
```

---

## Fixture Files

### Organizing Test Fixtures

```
tests/
  fixtures/
    users/
      admin.json
      standard-user.json
      inactive-user.json
    orders/
      pending-order.json
      multi-item-order.json
    responses/
      search-results.json
      empty-results.json
```

### Loading Fixtures

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

function loadFixture<T>(category: string, name: string): T {
  const path = join(__dirname, 'fixtures', category, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Usage
const adminUser = loadFixture<User>('users', 'admin');
const pendingOrder = loadFixture<Order>('orders', 'pending-order');
```

---

## Environment-Specific Data

### Configuration by Environment

```typescript
const testConfig = {
  local: {
    baseUrl: 'http://localhost:3000',
    dbUrl: 'postgres://test:test@localhost:5432/test_db',
    seedOnStart: true,
  },
  ci: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    dbUrl: process.env.DATABASE_URL || '',
    seedOnStart: true,
  },
  staging: {
    baseUrl: 'https://staging.example.com',
    dbUrl: '', // No direct DB access
    seedOnStart: false, // Use API-based setup
  },
};

const env = process.env.TEST_ENV || 'local';
export const config = testConfig[env as keyof typeof testConfig];
```

---

## Data Cleanup Strategies

- **Transaction rollback**: Fastest, works for unit/integration tests
- **Truncate tables**: Fast, use between test suites
- **Delete by test marker**: Tag test data with identifiable prefix
- **Disposable databases**: Create fresh DB per test run
- **Docker volumes**: Reset state by recreating containers

---

## Best Practices

- Never depend on data from other tests
- Use descriptive identifiers (e.g., `test-user-checkout-flow`)
- Keep factory definitions close to the domain they model
- Version control seed scripts alongside test code
- Generate realistic but not real PII (use faker, not production dumps)
- Document required test data in test file headers

---

## References

- Faker.js: https://fakerjs.dev/
- Factory pattern: https://refactoring.guru/design-patterns/factory-method
- Test data management: https://martinfowler.com/bliki/ObjectMother.html
- Playwright fixtures: https://playwright.dev/docs/test-fixtures

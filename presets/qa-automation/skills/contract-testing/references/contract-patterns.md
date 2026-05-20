# Contract Testing Patterns

Comprehensive guide to implementing consumer-driven contract testing for microservices and API integrations.

---

## Core Concepts

### What is Contract Testing

Contract testing verifies that services can communicate correctly by testing each side independently against a shared contract. Unlike integration tests, each service is tested in isolation.

### Consumer-Driven Contracts

The consumer defines expectations (the contract), and the provider verifies it can fulfill them:

```
Consumer (Frontend) --> Contract (Pact file) --> Provider (API)
     writes                shared                  verifies
```

---

## Pact Framework (JavaScript/TypeScript)

### Consumer Test

```typescript
import { PactV4, MatchersV3 } from '@pact-foundation/pact';

const provider = new PactV4({
  consumer: 'OrdersUI',
  provider: 'OrdersAPI',
  dir: './pacts',
});

describe('Orders API Contract', () => {
  it('returns a list of orders for a user', async () => {
    await provider
      .addInteraction()
      .given('user has orders')
      .uponReceiving('a request for user orders')
      .withRequest('GET', '/api/orders', (builder) => {
        builder.headers({
          Authorization: MatchersV3.string('Bearer token123'),
        });
        builder.query({ userId: MatchersV3.string('user-1') });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json' });
        builder.jsonBody({
          orders: MatchersV3.eachLike({
            id: MatchersV3.uuid(),
            status: MatchersV3.string('pending'),
            total: MatchersV3.decimal(99.99),
            createdAt: MatchersV3.iso8601DateTimeWithMillis(),
          }),
          total: MatchersV3.integer(5),
        });
      })
      .executeTest(async (mockServer) => {
        const client = new OrdersClient(mockServer.url);
        const result = await client.getOrders('user-1');

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0]).toHaveProperty('id');
        expect(result.orders[0]).toHaveProperty('status');
      });
  });
});
```

### Provider Verification

```typescript
import { Verifier } from '@pact-foundation/pact';
import { app } from '../src/app';

describe('Orders API Provider Verification', () => {
  let server: ReturnType<typeof app.listen>;

  beforeAll(() => {
    server = app.listen(0);
  });

  afterAll(() => server.close());

  it('validates the contract against the consumer', async () => {
    const verifier = new Verifier({
      providerBaseUrl: `http://localhost:${(server.address() as any).port}`,
      pactUrls: ['./pacts/OrdersUI-OrdersAPI.json'],
      stateHandlers: {
        'user has orders': async () => {
          await seedDatabase({ userId: 'user-1', orders: 3 });
        },
        'no orders exist': async () => {
          await clearDatabase();
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

---

## Schema-Based Contract Testing

### Using OpenAPI Specifications

```typescript
import SwaggerParser from '@apidevtools/swagger-parser';

describe('API Response Schema Validation', () => {
  let schemas: Record<string, object>;

  beforeAll(async () => {
    const api = await SwaggerParser.dereference('./openapi.yaml');
    schemas = api.components?.schemas || {};
  });

  it('GET /orders matches Order schema', async () => {
    const response = await fetch('/api/orders');
    const data = await response.json();

    const ajv = new Ajv();
    const validate = ajv.compile(schemas.OrderListResponse);
    const valid = validate(data);

    expect(valid).toBe(true);
    if (!valid) console.error(validate.errors);
  });
});
```

### JSON Schema Validation

```typescript
import Ajv from 'ajv';

const orderSchema = {
  type: 'object',
  required: ['id', 'status', 'items', 'total'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['pending', 'confirmed', 'shipped', 'delivered'] },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['productId', 'quantity', 'price'],
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          price: { type: 'number', minimum: 0 },
        },
      },
    },
    total: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

function validateResponse(data: unknown): boolean {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(orderSchema);
  return validate(data) as boolean;
}
```

---

## Pact Broker Integration

### Publishing Contracts

```bash
# Publish pact files to broker
npx pact-broker publish ./pacts \
  --consumer-app-version=$(git rev-parse --short HEAD) \
  --branch=$(git branch --show-current) \
  --broker-base-url=$PACT_BROKER_URL \
  --broker-token=$PACT_BROKER_TOKEN
```

### Can-I-Deploy Check

```bash
# Verify deployment safety
npx pact-broker can-i-deploy \
  --pacticipant=OrdersUI \
  --version=$(git rev-parse --short HEAD) \
  --to-environment=production \
  --broker-base-url=$PACT_BROKER_URL
```

### CI/CD Integration

```yaml
jobs:
  contract-test:
    steps:
      - run: npm test -- --testPathPattern=contract
      - run: npx pact-broker publish ./pacts
          --consumer-app-version=${{ github.sha }}
          --branch=${{ github.ref_name }}

  can-deploy:
    needs: contract-test
    steps:
      - run: npx pact-broker can-i-deploy
          --pacticipant=OrdersUI
          --version=${{ github.sha }}
          --to-environment=production
```

---

## Event-Driven Contracts

### Message Pact (Async)

```typescript
import { MessageConsumerPact, synchronousBodyHandler } from '@pact-foundation/pact';

const messagePact = new MessageConsumerPact({
  consumer: 'NotificationService',
  provider: 'OrderService',
  dir: './pacts',
});

describe('Order Events Contract', () => {
  it('processes order.created event', () => {
    return messagePact
      .given('an order is created')
      .expectsToReceive('an order.created event')
      .withContent({
        eventType: 'order.created',
        orderId: MatchersV3.uuid(),
        userId: MatchersV3.string('user-123'),
        items: MatchersV3.eachLike({ productId: MatchersV3.string('prod-1') }),
      })
      .verify(synchronousBodyHandler(async (message) => {
        const handler = new OrderEventHandler();
        await expect(handler.process(message)).resolves.not.toThrow();
      }));
  });
});
```

---

## Best Practices

### Contract Scope

- Test the shape of data, not business logic
- Use matchers for dynamic values (timestamps, UUIDs)
- Keep contracts focused on what the consumer actually uses
- Avoid over-specifying (do not assert on fields you do not consume)

### Versioning and Compatibility

- Use semantic versioning for API contracts
- Tag contracts with environment (dev, staging, production)
- Run can-i-deploy before every deployment
- Maintain backwards compatibility during migration periods

### Common Pitfalls

- Testing implementation details rather than interface contracts
- Not using provider states for different scenarios
- Coupling contract tests to internal data models
- Forgetting to publish updated contracts after consumer changes

---

## References

- Pact documentation: https://docs.pact.io/
- Contract testing guide: https://martinfowler.com/articles/consumerDrivenContracts.html
- Pact Broker: https://docs.pact.io/pact_broker
- Spring Cloud Contract: https://spring.io/projects/spring-cloud-contract

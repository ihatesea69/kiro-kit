# Load Testing Guide

Comprehensive reference for designing, implementing, and analyzing load tests to validate system performance under expected and peak conditions.

---

## Load Testing Fundamentals

### Test Types

| Type | Purpose | Duration | Load Pattern |
|------|---------|----------|--------------|
| Load Test | Validate under expected load | 15-60 min | Constant |
| Stress Test | Find breaking point | Until failure | Ramping up |
| Spike Test | Handle sudden bursts | 5-10 min | Sudden surge |
| Soak Test | Detect memory leaks | 4-24 hours | Constant |
| Scalability | Measure scaling behavior | Progressive | Step increase |

### Key Metrics

- **Response time percentiles**: p50, p90, p95, p99
- **Throughput**: requests per second (RPS)
- **Error rate**: percentage of non-2xx responses
- **Concurrent users**: active virtual users (VUs)
- **Resource utilization**: CPU, memory, network, disk I/O

---

## k6 (JavaScript-based)

### Basic Load Test

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/products');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'body contains products': (r) => r.json().products.length > 0,
  });

  sleep(1);
}
```

### Scenario-Based Testing

```javascript
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const users = new SharedArray('users', function () {
  return JSON.parse(open('./test-data/users.json'));
});

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      exec: 'browseProducts',
    },
    purchase: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      exec: 'purchaseFlow',
    },
  },
};

export function browseProducts() {
  group('Browse Products', () => {
    const res = http.get('http://localhost:3000/api/products');
    check(res, { 'browse OK': (r) => r.status === 200 });
    sleep(Math.random() * 3 + 1);

    const products = res.json().products;
    if (products.length > 0) {
      const product = products[Math.floor(Math.random() * products.length)];
      const detail = http.get(`http://localhost:3000/api/products/${product.id}`);
      check(detail, { 'detail OK': (r) => r.status === 200 });
    }
  });
}

export function purchaseFlow() {
  const user = users[Math.floor(Math.random() * users.length)];

  group('Purchase Flow', () => {
    // Login
    const loginRes = http.post('http://localhost:3000/api/auth/login', JSON.stringify({
      email: user.email,
      password: user.password,
    }), { headers: { 'Content-Type': 'application/json' } });

    check(loginRes, { 'login OK': (r) => r.status === 200 });
    const token = loginRes.json().token;

    // Add to cart
    const cartRes = http.post('http://localhost:3000/api/cart', JSON.stringify({
      productId: 'prod-1',
      quantity: 1,
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    check(cartRes, { 'cart OK': (r) => r.status === 200 });

    // Checkout
    const checkoutRes = http.post('http://localhost:3000/api/checkout', null, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(checkoutRes, { 'checkout OK': (r) => r.status === 200 });
  });
}
```

### Custom Metrics

```javascript
import http from 'k6/http';
import { Counter, Trend, Rate } from 'k6/metrics';

const orderDuration = new Trend('order_creation_duration');
const orderErrors = new Counter('order_errors');
const orderSuccess = new Rate('order_success_rate');

export default function () {
  const start = Date.now();
  const res = http.post('http://localhost:3000/api/orders', JSON.stringify({
    items: [{ productId: 'p1', quantity: 2 }],
  }), { headers: { 'Content-Type': 'application/json' } });

  const duration = Date.now() - start;
  orderDuration.add(duration);

  if (res.status === 201) {
    orderSuccess.add(1);
  } else {
    orderSuccess.add(0);
    orderErrors.add(1);
  }
}
```

---

## Artillery (YAML-based)

### Configuration

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 120
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"
  defaults:
    headers:
      Content-Type: "application/json"
  ensure:
    p95: 500
    maxErrorRate: 1

scenarios:
  - name: "Browse and purchase"
    weight: 70
    flow:
      - get:
          url: "/api/products"
          capture:
            - json: "$.products[0].id"
              as: "productId"
      - think: 2
      - get:
          url: "/api/products/{{ productId }}"
      - think: 1
      - post:
          url: "/api/cart"
          json:
            productId: "{{ productId }}"
            quantity: 1

  - name: "Search"
    weight: 30
    flow:
      - get:
          url: "/api/search?q=shoes"
      - think: 3
```

---

## Results Analysis

### Performance Budgets

```javascript
// k6 thresholds define pass/fail criteria
export const options = {
  thresholds: {
    // 95% of requests must complete within 500ms
    http_req_duration: ['p(95)<500'],
    // Less than 1% error rate
    http_req_failed: ['rate<0.01'],
    // Custom metric thresholds
    order_creation_duration: ['p(99)<2000'],
    order_success_rate: ['rate>0.95'],
  },
};
```

### Identifying Bottlenecks

1. **High p99 with low p50** - outlier requests hitting slow paths
2. **Increasing latency over time** - possible memory leak or connection exhaustion
3. **Sudden error spikes** - resource limits hit (DB connections, file handles)
4. **Throughput plateau** - system saturated, adding users increases latency only

### Reporting

```bash
# k6 JSON output for CI parsing
k6 run --out json=results.json load-test.js

# k6 with InfluxDB for dashboards
k6 run --out influxdb=http://localhost:8086/k6 load-test.js

# Artillery report generation
artillery run test.yaml --output results.json
artillery report results.json --output report.html
```

---

## CI Integration

```yaml
- name: Run load tests
  run: |
    k6 run --out json=k6-results.json tests/load/api-load.js
    
- name: Check thresholds
  run: |
    node -e "
      const results = require('./k6-results.json');
      if (results.root_group.checks.fails > 0) {
        process.exit(1);
      }
    "
```

---

## References

- k6 documentation: https://grafana.com/docs/k6/latest/
- Artillery docs: https://www.artillery.io/docs
- Locust (Python): https://docs.locust.io/
- Performance testing patterns: https://martinfowler.com/articles/practical-test-pyramid.html

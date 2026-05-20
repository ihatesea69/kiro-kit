# Performance Testing Patterns

Comprehensive guide to designing, implementing, and analyzing performance tests for web applications and APIs.

---

## Performance Test Types

| Type | Goal | Load Pattern | Duration |
|------|------|--------------|----------|
| Baseline | Establish normal metrics | Single user | Minutes |
| Load | Validate under expected traffic | Gradual ramp | 15-60 min |
| Stress | Find breaking point | Continuous ramp | Until failure |
| Spike | Handle sudden bursts | Instant surge | 5-10 min |
| Soak/Endurance | Detect leaks and degradation | Constant | 4-24 hours |
| Capacity | Determine max throughput | Progressive | Hours |

---

## Performance Budgets

### Defining Budgets

```json
{
  "budgets": {
    "api": {
      "p50_response_time_ms": 100,
      "p95_response_time_ms": 300,
      "p99_response_time_ms": 500,
      "error_rate_percent": 0.1,
      "throughput_rps": 1000
    },
    "web": {
      "first_contentful_paint_ms": 1500,
      "largest_contentful_paint_ms": 2500,
      "time_to_interactive_ms": 3500,
      "cumulative_layout_shift": 0.1,
      "total_blocking_time_ms": 200
    }
  }
}
```

### Lighthouse CI

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/', 'http://localhost:3000/products'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'interactive': ['error', { maxNumericValue: 3500 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

---

## API Performance Testing

### k6 Performance Test

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics
const apiLatency = new Trend('api_latency', true);
const apiErrors = new Counter('api_errors');
const apiSuccess = new Rate('api_success');

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    api_latency: ['p(95)<300', 'p(99)<500'],
    api_success: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const payload = JSON.stringify({
    query: 'performance testing',
    page: 1,
    limit: 20,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'search' },
  };

  const res = http.post('http://localhost:3000/api/search', payload, params);

  apiLatency.add(res.timings.duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has results': (r) => r.json().results !== undefined,
    'latency under budget': (r) => r.timings.duration < 300,
  });

  if (!success) apiErrors.add(1);
  apiSuccess.add(success ? 1 : 0);

  sleep(Math.random() * 2 + 0.5);
}
```

### Database Query Performance

```typescript
import { performance } from 'perf_hooks';

describe('Database Query Performance', () => {
  it('product search completes within budget', async () => {
    const iterations = 100;
    const timings: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await db.query('SELECT * FROM products WHERE name LIKE $1 LIMIT 20', ['%test%']);
      timings.push(performance.now() - start);
    }

    timings.sort((a, b) => a - b);
    const p50 = timings[Math.floor(iterations * 0.5)];
    const p95 = timings[Math.floor(iterations * 0.95)];
    const p99 = timings[Math.floor(iterations * 0.99)];

    expect(p50).toBeLessThan(50);
    expect(p95).toBeLessThan(100);
    expect(p99).toBeLessThan(200);
  });
});
```

---

## Frontend Performance Testing

### Web Vitals Measurement

```typescript
import { test, expect } from '@playwright/test';

test('homepage meets Core Web Vitals', async ({ page }) => {
  await page.goto('/');

  // Measure LCP
  const lcp = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        resolve(entries[entries.length - 1].startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
  });

  // Measure CLS
  const cls = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
        resolve(clsValue);
      }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => resolve(clsValue), 5000);
    });
  });

  expect(lcp).toBeLessThan(2500);
  expect(cls).toBeLessThan(0.1);
});
```

### Bundle Size Monitoring

```javascript
// size-limit.config.js
module.exports = [
  {
    name: 'Main bundle',
    path: 'dist/main.*.js',
    limit: '150 KB',
    gzip: true,
  },
  {
    name: 'CSS',
    path: 'dist/styles.*.css',
    limit: '30 KB',
    gzip: true,
  },
  {
    name: 'Vendor bundle',
    path: 'dist/vendor.*.js',
    limit: '200 KB',
    gzip: true,
  },
];
```

---

## Profiling and Analysis

### Memory Leak Detection

```typescript
test('no memory leak on repeated navigation', async ({ page }) => {
  await page.goto('/');

  // Take initial heap snapshot
  const initialHeap = await page.evaluate(() => {
    if (window.gc) window.gc();
    return (performance as any).measureUserAgentSpecificMemory?.()
      || { bytes: performance.memory?.usedJSHeapSize || 0 };
  });

  // Navigate back and forth 20 times
  for (let i = 0; i < 20; i++) {
    await page.goto('/products');
    await page.goto('/');
  }

  const finalHeap = await page.evaluate(() => {
    if (window.gc) window.gc();
    return (performance as any).measureUserAgentSpecificMemory?.()
      || { bytes: performance.memory?.usedJSHeapSize || 0 };
  });

  // Allow 20% growth margin
  const growth = (finalHeap.bytes - initialHeap.bytes) / initialHeap.bytes;
  expect(growth).toBeLessThan(0.2);
});
```

### Network Waterfall Analysis

```typescript
test('critical resources load in priority order', async ({ page }) => {
  const resourceTimings: Array<{ name: string; start: number; end: number }> = [];

  page.on('response', (response) => {
    const timing = response.request().timing();
    resourceTimings.push({
      name: response.url(),
      start: timing.startTime,
      end: timing.responseEnd,
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Verify critical CSS loads before scripts
  const cssEnd = resourceTimings
    .filter((r) => r.name.includes('.css'))
    .reduce((max, r) => Math.max(max, r.end), 0);

  const jsStart = resourceTimings
    .filter((r) => r.name.includes('.js') && !r.name.includes('critical'))
    .reduce((min, r) => Math.min(min, r.start), Infinity);

  expect(cssEnd).toBeLessThan(jsStart);
});
```

---

## CI Integration

```yaml
jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm start &
      - run: npx wait-on http://localhost:3000
      - name: Lighthouse CI
        run: npx lhci autorun
      - name: Bundle size check
        run: npx size-limit
```

---

## References

- Web Vitals: https://web.dev/vitals/
- k6 documentation: https://grafana.com/docs/k6/latest/
- Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci
- Size Limit: https://github.com/ai/size-limit
- Performance budgets: https://web.dev/performance-budgets-101/

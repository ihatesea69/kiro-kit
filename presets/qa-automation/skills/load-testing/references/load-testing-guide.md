# Load Testing Guide

## Load Profiles

- Ramp-up: gradually increase users over time
- Steady state: maintain constant user count
- Spike: sudden burst of users
- Step: increase in defined increments

## k6 Example

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // ramp up
    { duration: '5m', target: 100 },  // steady state
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};
```

## Metrics to Monitor

- Response time percentiles (p50, p90, p95, p99)
- Requests per second (throughput)
- Error rate under load
- Resource utilization (CPU, memory, connections)
- Queue depths and connection pool usage

## Best Practices

- Use realistic data and user patterns
- Test in production-like environment
- Monitor server metrics during tests
- Start with baseline and increase gradually
- Document results and compare across releases

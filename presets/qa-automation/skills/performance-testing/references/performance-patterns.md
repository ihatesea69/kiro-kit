# Performance Testing Patterns

## Test Types

- Load Testing: expected concurrent users
- Stress Testing: beyond expected capacity
- Endurance Testing: sustained load over time
- Spike Testing: sudden traffic bursts
- Scalability Testing: increasing load incrementally

## Key Metrics

- Response Time: p50, p90, p95, p99
- Throughput: requests per second
- Error Rate: percentage of failed requests
- Resource Usage: CPU, memory, connections

## Performance Budgets

- API response time: p95 < 200ms
- Page load: < 3s on 3G connection
- Time to interactive: < 5s
- Error rate: < 0.1% under normal load

## Tools

- k6: JavaScript-based, developer-friendly
- Artillery: YAML configuration, easy CI integration
- Locust: Python-based, distributed testing
- Gatling: Scala/Java, detailed reports

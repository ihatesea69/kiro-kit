---
inclusion: always
description: Patterns for structuring test execution in CI/CD pipelines including stage ordering, parallelization, and failure handling.
---

# CI/CD Testing Patterns

## Pipeline Stage Order

1. Static Analysis (lint, typecheck)
2. Unit Tests (fast feedback)
3. Integration Tests (service boundaries)
4. E2E Tests (critical user journeys)
5. Performance Tests (scheduled/on-demand)

## Parallelization

- Shard e2e tests across multiple runners
- Use matrix strategies for cross-browser execution
- Balance shards by execution time, not file count
- Merge results from all shards before reporting

## Failure Handling

- Retry infrastructure-caused failures (max 2 retries)
- Never retry deterministic failures
- Collect all artifacts on failure (screenshots, videos, logs)
- Send notifications only on state change (pass to fail)

## Caching Strategy

- Cache node_modules / Maven repository between runs
- Cache browser binaries for Playwright/Selenium
- Invalidate cache on lockfile changes only

## Environment Management

- Use ephemeral environments for test execution
- Seed test data at pipeline start
- Clean up resources after completion
- Isolate pipelines from each other

## Quality Gates

- Unit test coverage: 80%+ branch coverage
- No critical/high severity defects
- All smoke tests pass
- Performance budgets met
- No new accessibility violations

## Reporting

- Generate JUnit XML for CI system integration
- Produce HTML reports for human review
- Track test health trends over time
- Alert on regression in pass rate

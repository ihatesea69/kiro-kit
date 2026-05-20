# CI/CD Pipeline Patterns

## Pipeline Stages

1. Lint and static analysis
2. Unit tests (fastest feedback)
3. Integration tests
4. E2E tests (slowest, most comprehensive)
5. Performance tests (scheduled/on-demand)

## Parallel Execution

- Shard tests by file or test group
- Use matrix strategies for cross-browser testing
- Balance shards for even execution time
- Merge results from all shards for reporting

## Artifact Management

- Collect screenshots and videos on failure
- Generate HTML test reports
- Upload coverage reports
- Retain artifacts for configurable duration

## Optimization

- Cache dependencies between runs
- Use conditional execution (run e2e only on relevant changes)
- Implement smart retry for infrastructure flakiness
- Set timeouts to prevent hung pipelines

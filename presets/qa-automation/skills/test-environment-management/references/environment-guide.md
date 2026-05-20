# Test Environment Guide

## Environment Types

- Local Development: developer machine with mocked dependencies
- CI Environment: automated pipeline with ephemeral containers
- Staging: production-like for integration and e2e tests
- Performance: dedicated for load and performance testing

## Configuration Management

- Use environment variables for all configuration
- Maintain per-environment config files
- Never hardcode environment-specific values in tests
- Use service discovery for dynamic endpoints

## Containerization

- Docker Compose for local multi-service testing
- Testcontainers for integration test dependencies
- Ephemeral containers in CI for isolation
- Container cleanup after test completion

## Best Practices

- Automate environment provisioning
- Use infrastructure as code
- Implement health checks before test execution
- Isolate environments from each other
- Clean up resources after test runs
- Document environment requirements clearly

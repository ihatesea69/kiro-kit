# Development Rules

## Code Quality

- Test code follows the same quality standards as production code
- No hardcoded values (URLs, credentials, test data)
- No arbitrary delays (sleep, timeout, networkidle)
- Meaningful names for tests, variables, and methods
- Single responsibility per test method
- DRY: extract common patterns into utilities

## Version Control

- Create feature branches for all test work
- Use conventional commits (test:, fix:, refactor:)
- Keep commits focused and atomic
- Write descriptive commit messages
- Request review for structural changes

## Testing Standards

- Tests must be independent and order-agnostic
- Each test creates its own preconditions
- Clean up test data after execution
- Use explicit waits for all synchronization
- Validate both positive and negative scenarios
- Never ignore failing tests to proceed

## Documentation

- Update documentation when adding new tests
- Document test data requirements
- Keep README current with setup instructions
- Record architectural decisions with rationale

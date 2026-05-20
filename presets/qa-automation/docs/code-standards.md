# Code Standards

## General Principles

- Test code follows the same quality standards as production code
- Readability and maintainability are primary goals
- Follow existing patterns in the codebase
- Keep functions focused and single-purpose
- Use meaningful, descriptive names

## TypeScript/JavaScript Standards

- Use strict TypeScript configuration
- No `any` type; prefer proper interfaces
- Use async/await over promise chains
- Define interfaces for data structures
- Use const for values that do not change

## Java Standards

- Follow standard Java naming conventions
- Use modern Java features (var, records, switch expressions)
- Apply SOLID principles
- Use AssertJ for assertions
- Follow Maven project structure

## Test-Specific Standards

- One assertion concept per test
- Tests are independent and order-agnostic
- Use descriptive test method names
- Group related tests logically
- External test data (no hardcoding)
- Explicit waits only (no sleep/timeout)

## File Organization

- Group by feature, not by type
- Keep related files close together
- Use consistent naming conventions
- Maintain clear directory structure

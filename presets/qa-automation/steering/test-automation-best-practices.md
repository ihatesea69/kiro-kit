---
inclusion: always
description: Core best practices for test automation across all frameworks and test levels.
---

# Test Automation Best Practices

## Test Design Principles

- Each test validates one behavior or scenario
- Tests are independent and can run in any order
- Tests create their own preconditions (no shared mutable state)
- Tests clean up after themselves
- Tests are deterministic and reproducible

## Naming and Organization

- Test names describe the scenario and expected outcome
- Group related tests in describe/suite blocks
- Use tags or annotations for categorization (smoke, regression)
- Keep test files focused on one feature or page

## Assertions

- Assert one logical concept per test
- Use descriptive assertion messages
- Prefer specific assertions over generic ones
- Validate both positive and negative outcomes
- Check side effects, not just return values

## Wait Strategies

- Use explicit waits with clear conditions
- Never use arbitrary delays (sleep, timeout)
- Wait for specific application state, not time
- Set reasonable timeout values with clear failure messages

## Test Data

- Use factories or builders for test object creation
- Never hardcode credentials or sensitive data
- Generate unique data to prevent test collision
- Clean up test data after execution
- Use environment variables for configuration

## Maintenance

- Review and update tests when application changes
- Remove obsolete tests rather than skipping
- Refactor duplicated setup into shared utilities
- Monitor test suite health (pass rate, duration, flakiness)
- Keep test code to the same quality standard as production code

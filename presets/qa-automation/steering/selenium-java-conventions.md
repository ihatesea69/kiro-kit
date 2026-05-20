---
inclusion: manual
description: Java conventions and best practices for Selenium WebDriver test automation including POM pattern, explicit waits, and JUnit 5 structure.
---

# Selenium Java Conventions

## Project Structure

```
src/
  main/java/      - Page Objects, utilities, base classes
  test/java/      - Test classes
  test/resources/ - Test data, configuration
pom.xml
```

## Page Object Model

- All UI interaction through Page Object classes
- One POM class per logical page or component
- Locators as private fields with descriptive names
- Public methods for user actions
- Methods return the next page object for fluent API

## Explicit Waits

- Use WebDriverWait + ExpectedConditions for all synchronization
- Never use Thread.sleep()
- Set reasonable default timeouts (10-30 seconds)
- Use Duration-based timeout configuration
- Create custom wait conditions for complex scenarios

## Assertions

- Use AssertJ for all assertions
- Prefer soft assertions for multiple checks
- Include descriptive messages with assertions
- Use extracting() for object property assertions

## JUnit 5

- Use @Test, @BeforeEach, @AfterEach, @DisplayName
- Use @ParameterizedTest for data-driven tests
- Use @Tag for test categorization (smoke, regression)
- Avoid test ordering dependencies

## Selector Priority

ID > data-testid > semantic CSS > class > XPath (last resort only)

## Test Data

- Store in external files or constants classes
- Use JavaFaker for dynamic generation
- Never hardcode URLs, credentials, or test data in test methods
- Use environment variables for environment-specific values

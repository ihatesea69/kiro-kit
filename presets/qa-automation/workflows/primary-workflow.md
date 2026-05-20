# Primary Workflow

Follow this cycle for all QA automation work: Plan, Implement, Execute, Analyze.

## 1. Planning

- Analyze the feature or change under test
- Identify test levels and types needed
- Create test scenarios covering happy path, edge cases, and errors
- Determine automation approach and framework

## 2. Implementation

- Write clean, maintainable test code
- Follow Page Object Model for UI tests
- Use proper wait strategies (explicit waits only)
- Keep test data external and configurable
- Use meaningful test names and descriptions
- After writing tests, run them to verify they pass

## 3. Execution

- Run the appropriate test suite
- Collect results and artifacts
- Monitor for flaky behavior
- Verify coverage meets thresholds

## 4. Analysis

- Categorize any failures (product bug, test issue, environment)
- Document findings clearly
- Update test documentation
- Report results with actionable recommendations

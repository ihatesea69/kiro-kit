# Orchestration Protocol

## Agent Selection

When a QA task arrives, determine the appropriate specialist:

| Task Type | Agent | Priority |
|-----------|-------|----------|
| Test planning | playwright-test-planner | High |
| Test generation | playwright-test-generator | High |
| Test debugging | playwright-test-healer | Critical |
| Flaky tests | flaky-test-hunter | High |
| Test refactoring | test-refactor-specialist | Medium |
| API testing | api-tester-specialist | High |
| Selenium tests | selenium-test-specialist | High |
| Performance | performance-tester | Medium |
| Visual testing | visual-regression-tester | Medium |

## Delegation Rules

1. One task per agent at a time
2. Pass full context with each delegation
3. Verify output before proceeding to next step
4. Never skip verification between steps

## Context Passing

Include with every delegation:
- Original user request
- Relevant file paths
- Output from previous steps
- Constraints and preferences
- Expected output format

## Error Recovery

- If a specialist fails, analyze the failure
- Retry with additional context if appropriate
- Escalate to human if retry fails
- Document failure for future reference

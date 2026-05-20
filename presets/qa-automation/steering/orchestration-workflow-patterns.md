---
inclusion: always
description: Patterns for orchestrating multi-agent QA workflows including task routing, context passing, and quality enforcement.
---

# Orchestration Workflow Patterns

## Task Routing

Route tasks to specialists based on type:

- Test Planning: playwright-test-planner or equivalent
- Test Generation: playwright-test-generator or selenium-test-specialist
- Test Debugging: playwright-test-healer or selenium-test-executor
- Flaky Tests: flaky-test-hunter
- Refactoring: test-refactor-specialist
- API Testing: api-tester-specialist
- Performance: performance-tester

## Context Passing

When delegating between agents:

1. Include the original user request
2. Provide relevant file paths and context
3. Pass any constraints or preferences
4. Include results from previous agent steps
5. Specify expected output format

## Quality Enforcement

All orchestrated work must follow these rules:

1. Tests must pass before handoff
2. No arbitrary delays (waitForTimeout, Thread.sleep)
3. Page Object Model for all UI interaction
4. External test data (no hardcoding)
5. Proper assertion coverage
6. Clean code with meaningful names

## Multi-Step Workflow

For complex tasks requiring multiple agents:

1. Plan: determine agent sequence
2. Execute: delegate to each agent in order
3. Verify: check output of each step
4. Integrate: combine results if needed
5. Report: summarize overall outcome

## Error Handling

- If an agent fails, attempt targeted retry
- Escalate to human if retry fails
- Never proceed with broken output
- Document failure reasons for future reference

---
description: Generate test automation code for the specified scenario or component.
argument-hint:
  - test-scenario
---

## Context
Generate test code for:
<scenario>$ARGUMENTS</scenario>

## Your Role
You are a Test Automation Engineer writing clean, maintainable test code following project conventions.

## Process
1. Understand the test scenario
2. Choose appropriate framework and patterns
3. Implement with proper structure (POM, fixtures, assertions)
4. Verify the test runs successfully

## Quality Standards
- Follow Page Object Model for UI tests
- Use explicit waits, never arbitrary delays
- Use web-first assertions
- Keep test data external
- Add meaningful test descriptions

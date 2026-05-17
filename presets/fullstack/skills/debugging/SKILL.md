---
name: debugging
description: >-
  Systematic debugging framework for root cause investigation. Use when
  encountering bugs, test failures, unexpected behavior, or performance issues.
version: 3.0.0
languages: all
---

# Debugging

Activate when encountering bugs, test failures, or unexpected behavior that needs systematic investigation.

## When to Use

- Tests failing unexpectedly
- Runtime errors in development or production
- Performance degradation
- Unexpected behavior that does not match specifications
- Integration failures between components

## Four-Phase Process

### 1. Observe
- Reproduce the issue reliably
- Collect error messages, stack traces, logs
- Note the exact conditions (input, environment, timing)

### 2. Hypothesize
- Form 2-3 possible explanations
- Rank by likelihood based on evidence
- Identify what evidence would confirm/deny each

### 3. Test
- Validate hypotheses with minimal changes
- Use breakpoints, logging, or isolated tests
- Eliminate possibilities systematically

### 4. Fix and Verify
- Implement targeted fix for confirmed root cause
- Verify fix resolves the original issue
- Check for regressions in related functionality
- Add test to prevent recurrence

## Rules

- Never apply random fixes without understanding the cause
- Always reproduce before attempting to fix
- Check recent changes first (git log, deployments)
- Verify the fix does not mask a deeper issue

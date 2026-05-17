---
name: debugging
description: >-
  Systematic debugging framework for investigating root causes before applying
  fixes. Use when encountering bugs, test failures, or unexpected behavior.
version: 3.0.0
languages: all
---

# Debugging

Activate this skill when encountering bugs, test failures, or unexpected behavior.

## When to Use

- Tests are failing unexpectedly
- Runtime errors or crashes occur
- Behavior does not match expectations
- Performance degrades without obvious cause
- Build or compilation errors appear

## Process

1. Reproduce the issue consistently
2. Gather evidence (error messages, stack traces, logs)
3. Form hypothesis about root cause
4. Trace backward from the symptom to the source
5. Validate hypothesis with targeted tests
6. Apply minimal fix addressing root cause
7. Verify fix resolves the issue without regressions

## Rules

- Never apply random fixes without understanding the cause
- Measure and trace before changing code
- If a fix attempt fails twice, step back and reconsider the hypothesis
- Check recent changes (git log) as first investigation step
- Isolate the problem to the smallest reproducible case

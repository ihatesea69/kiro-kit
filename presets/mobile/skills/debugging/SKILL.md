---
name: debugging
description: Systematic debugging framework for investigating root causes before applying fixes. Use when encountering bugs, test failures, or unexpected behavior in mobile apps.
---

# Debugging

Activate this skill when encountering bugs, test failures, or unexpected behavior.

## When to Use

- Tests are failing unexpectedly
- Runtime errors or crashes occur
- Behavior differs between platforms
- Performance degrades without obvious cause
- Build or compilation errors appear
- State management produces unexpected results

## Process

1. Reproduce the issue consistently (note device, OS version)
2. Gather evidence (error messages, stack traces, logs)
3. Form hypothesis about root cause
4. Trace backward from the symptom to the source
5. Validate hypothesis with targeted tests
6. Apply minimal fix addressing root cause
7. Verify fix resolves the issue without regressions

## Rules

- Never apply random fixes without understanding the cause
- Check if issue is platform-specific or cross-platform
- If a fix attempt fails twice, step back and reconsider
- Check recent changes (git log) as first investigation step
- Isolate the problem to the smallest reproducible case
- Test fix on both platforms before considering resolved

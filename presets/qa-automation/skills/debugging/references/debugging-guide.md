# Debugging Guide

## Systematic Approach

1. Reproduce: confirm the failure is reproducible
2. Isolate: narrow down to smallest failing unit
3. Diagnose: identify root cause with evidence
4. Fix: apply targeted fix
5. Verify: confirm fix resolves the issue
6. Prevent: add guards against recurrence

## Common Failure Categories

- Timing: race conditions, async operations
- Locator: element not found, stale references
- Data: unexpected state, missing preconditions
- Environment: network, configuration, resources
- Logic: incorrect assertions, wrong expectations

## Diagnostic Tools

- Browser DevTools: DOM inspection, network, console
- Test traces: Playwright trace viewer
- Screenshots: capture at failure point
- Videos: record test execution
- Logs: application and test framework logs

## Isolation Techniques

- Run single test in isolation
- Use headed mode for visual debugging
- Add breakpoints and step through
- Capture state before and after each action
- Compare passing vs failing environments

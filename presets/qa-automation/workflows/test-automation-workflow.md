# Test Automation Workflow

## New Feature Testing

1. Review feature requirements and acceptance criteria
2. Create test plan with scenarios and expected results
3. Set up test data and environment prerequisites
4. Implement automated tests following project patterns
5. Execute tests and verify all pass
6. Review coverage and add missing scenarios
7. Commit with conventional commit message

## Bug Verification

1. Reproduce the bug manually or with existing tests
2. Write a failing test that demonstrates the bug
3. Verify the test fails for the right reason
4. After fix is applied, confirm test passes
5. Add to regression suite

## Regression Testing

1. Identify impact area from code changes
2. Select relevant regression tests
3. Execute the regression suite
4. Analyze any failures (real regression vs test issue)
5. Report results with categorized failures

## Test Maintenance

1. Monitor test health metrics (pass rate, duration, flakiness)
2. Investigate and fix flaky tests promptly
3. Update tests when application changes
4. Remove obsolete tests
5. Refactor duplicated code into utilities

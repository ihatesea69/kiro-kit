# Code Coverage Guide

## Coverage Types

- Line Coverage: percentage of executed lines
- Branch Coverage: percentage of taken decision branches
- Function Coverage: percentage of called functions
- Statement Coverage: percentage of executed statements

## Thresholds

- Business logic: 80%+ branch coverage
- Utilities: 90%+ line coverage
- UI components: 70%+ line coverage
- Generated code: excluded from metrics

## Tools

- Istanbul/nyc (JavaScript/TypeScript)
- JaCoCo (Java)
- coverage.py (Python)
- Playwright coverage API (browser code)

## Reporting

- HTML reports for local development
- LCOV format for CI integration
- Coverage diff on pull requests
- Trend tracking over time

## Best Practices

- Focus on branch coverage over line coverage
- Exclude generated code and configuration
- Set per-module thresholds
- Require coverage for new code in PRs
- Track trends rather than absolute numbers

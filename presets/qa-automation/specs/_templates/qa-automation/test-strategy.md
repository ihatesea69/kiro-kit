# Test Strategy: [Project Name]

## Objectives

- Ensure quality meets defined standards before release
- Prevent regression in existing functionality
- Validate new features meet acceptance criteria
- Maintain test suite health and reliability

## Test Levels

### Unit Tests
- Scope: Individual functions, methods, components
- Responsibility: Development team
- Coverage target: 80%+ branch coverage
- Execution: Every commit, local and CI

### Integration Tests
- Scope: Service boundaries, API contracts
- Responsibility: Development and QA team
- Coverage target: All service interfaces
- Execution: Every PR, CI pipeline

### End-to-End Tests
- Scope: Critical user journeys
- Responsibility: QA team
- Coverage target: Top 10 user journeys
- Execution: Nightly and pre-release

### Performance Tests
- Scope: SLA-critical endpoints
- Responsibility: QA and Platform team
- Targets: p95 < 200ms, error rate < 0.1%
- Execution: Weekly and pre-release

## Tools

| Level | Framework | Language |
|-------|-----------|----------|
| Unit | [Framework] | [Language] |
| Integration | [Framework] | [Language] |
| E2E | Playwright | TypeScript |
| Performance | k6 | JavaScript |

## Risk-Based Prioritization

| Risk Area | Priority | Test Coverage |
|-----------|----------|---------------|
| Authentication | Critical | Full automation |
| Payment processing | Critical | Full automation |
| Core user flows | High | Full automation |
| Secondary features | Medium | Key scenarios |
| Admin functions | Low | Smoke tests |

## Quality Gates

- Unit coverage: >= 80% branches
- Integration: all APIs tested
- E2E: all critical paths pass
- Performance: SLAs met
- Security: no critical/high vulnerabilities
- Accessibility: WCAG 2.1 AA compliant

## Reporting

- Daily: automated test results in CI
- Weekly: quality dashboard with trends
- Release: comprehensive test report
- Ad-hoc: defect reports as found

# CI/CD Pipeline Patterns for Test Automation

Comprehensive guide to integrating test automation into continuous integration and delivery pipelines.

---

## Pipeline Architecture

### Stage Design

A well-structured test pipeline organizes stages by speed and scope:

```yaml
# GitHub Actions example
name: Test Pipeline
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test_pass
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgres://postgres:test_pass@localhost:5432/test_db

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.shard }}
          path: playwright-report/
```

### Stage Ordering Rationale

1. **Lint and static analysis** - seconds, catches obvious issues
2. **Unit tests** - seconds to minutes, verifies logic
3. **Integration tests** - minutes, validates service interactions
4. **E2E tests** - minutes to tens of minutes, confirms user flows
5. **Performance tests** - typically scheduled or on-demand

---

## Parallel Execution Strategies

### Test Sharding

Split test files across multiple runners for faster feedback:

```typescript
// playwright.config.ts - CI-optimized
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['blob'], ['github']]
    : [['html']],
});
```

### Matrix Strategies

Run tests across multiple browser and OS combinations:

```yaml
strategy:
  fail-fast: false
  matrix:
    browser: [chromium, firefox, webkit]
    os: [ubuntu-latest, windows-latest, macos-latest]
    exclude:
      - browser: webkit
        os: windows-latest
```

### Shard Balancing

Distribute tests evenly based on historical timing data:

```bash
# Use Playwright's built-in sharding
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

---

## Artifact Management

### Collecting Failure Evidence

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results-${{ matrix.shard }}
    path: |
      test-results/
      playwright-report/
    retention-days: 14
```

### Merging Sharded Reports

```yaml
merge-reports:
  needs: e2e-tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v4
      with:
        pattern: blob-report-*
        merge-multiple: true
        path: all-blob-reports
    - run: npx playwright merge-reports --reporter=html ./all-blob-reports
    - uses: actions/upload-artifact@v4
      with:
        name: merged-html-report
        path: playwright-report/
```

### Coverage Report Aggregation

```yaml
- name: Upload coverage to reporting service
  run: |
    npx nyc merge coverage/ merged-coverage.json
    npx nyc report --reporter=lcov --temp-dir=coverage
```

---

## Pipeline Optimization

### Dependency Caching

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Conditional Execution

Run expensive tests only when relevant code changes:

```yaml
- uses: dorny/paths-filter@v3
  id: changes
  with:
    filters: |
      e2e:
        - 'src/**'
        - 'tests/e2e/**'
        - 'playwright.config.ts'

- name: Run E2E tests
  if: steps.changes.outputs.e2e == 'true'
  run: npx playwright test
```

### Smart Retry Logic

```yaml
- name: Run tests with retry
  uses: nick-fields/retry@v3
  with:
    timeout_minutes: 30
    max_attempts: 3
    retry_on: error
    command: npx playwright test
```

---

## Notifications and Reporting

### Slack Notification on Failure

```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Test pipeline failed on ${{ github.ref_name }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Test Failure* on `${{ github.ref_name }}`\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### JUnit Report Publishing

```yaml
- name: Publish test results
  uses: dorny/test-reporter@v1
  if: always()
  with:
    name: Test Results
    path: test-results/junit.xml
    reporter: java-junit
```

---

## Environment Variables and Secrets

### Managing Test Configuration

```yaml
env:
  BASE_URL: ${{ vars.BASE_URL || 'http://localhost:3000' }}
  TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
  TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
  BROWSER: ${{ matrix.browser || 'chromium' }}
  CI: true
```

### Docker-based Test Environments

```yaml
services:
  app:
    image: ${{ github.repository }}:${{ github.sha }}
    ports:
      - 3000:3000
    env:
      DATABASE_URL: postgres://postgres:pass@postgres:5432/test
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: pass
```

---

## Timeout and Resource Management

- Set explicit timeouts for each step to prevent hung pipelines
- Use `timeout-minutes` at the job or step level
- Configure resource limits for Docker-based services
- Implement graceful shutdown handlers in test teardown

```yaml
jobs:
  e2e:
    timeout-minutes: 30
    steps:
      - name: Run tests
        timeout-minutes: 20
        run: npx playwright test
```

---

## References

- GitHub Actions documentation: https://docs.github.com/en/actions
- Playwright CI guide: https://playwright.dev/docs/ci
- GitLab CI/CD: https://docs.gitlab.com/ee/ci/
- CircleCI test splitting: https://circleci.com/docs/parallelism-faster-jobs/

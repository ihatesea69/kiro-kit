# Test Reporting Guide

Comprehensive reference for generating, publishing, and analyzing test reports across different testing stages and tools.

---

## Report Types

| Report | Audience | Content | Format |
|--------|----------|---------|--------|
| CI Summary | Developers | Pass/fail counts, duration | Text, annotations |
| HTML Report | QA Team | Detailed results, screenshots | HTML |
| JUnit XML | CI Systems | Machine-readable results | XML |
| Coverage | Tech Lead | Code coverage metrics | HTML, LCOV |
| Trend | Management | Historical pass rates | Dashboard |
| Flaky | DevOps | Intermittent failure patterns | JSON, Dashboard |

---

## Playwright Reporting

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    // Console output during development
    ['list'],
    // HTML report for detailed inspection
    ['html', {
      outputFolder: 'playwright-report',
      open: 'never',
    }],
    // JUnit for CI integration
    ['junit', {
      outputFile: 'test-results/junit.xml',
      includeProjectInTestName: true,
    }],
    // JSON for custom processing
    ['json', {
      outputFile: 'test-results/results.json',
    }],
    // GitHub Actions annotations
    ...(process.env.CI ? [['github'] as const] : []),
  ],
});
```

### Custom Reporter

```typescript
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  Suite,
} from '@playwright/test/reporter';

class CustomReporter implements Reporter {
  private results: Array<{ test: string; status: string; duration: number }> = [];

  onTestEnd(test: TestCase, result: TestResult) {
    this.results.push({
      test: test.title,
      status: result.status,
      duration: result.duration,
    });
  }

  onEnd(result: FullResult) {
    const passed = this.results.filter((r) => r.status === 'passed').length;
    const failed = this.results.filter((r) => r.status === 'failed').length;
    const skipped = this.results.filter((r) => r.status === 'skipped').length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    const summary = {
      total: this.results.length,
      passed,
      failed,
      skipped,
      duration_ms: totalDuration,
      pass_rate: ((passed / this.results.length) * 100).toFixed(1),
      status: result.status,
    };

    console.log(JSON.stringify(summary, null, 2));
  }
}

export default CustomReporter;
```

---

## JUnit XML Format

### Standard Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="E2E Tests" tests="45" failures="2" errors="0" time="123.456">
  <testsuite name="checkout" tests="10" failures="1" time="45.2">
    <testcase name="completes purchase with credit card" classname="checkout" time="5.123">
    </testcase>
    <testcase name="shows error for invalid card" classname="checkout" time="3.456">
      <failure message="Expected status 'error' but got 'pending'" type="AssertionError">
        Error: Expected status 'error' but got 'pending'
          at Object.&lt;anonymous&gt; (tests/checkout.spec.ts:45:12)
      </failure>
    </testcase>
    <testcase name="skipped test" classname="checkout" time="0">
      <skipped message="Feature not yet implemented"/>
    </testcase>
  </testsuite>
</testsuites>
```

### Publishing in GitHub Actions

```yaml
- name: Publish Test Results
  uses: dorny/test-reporter@v1
  if: always()
  with:
    name: 'E2E Test Results'
    path: 'test-results/junit.xml'
    reporter: 'java-junit'
    fail-on-error: false
```

---

## Coverage Reporting

### Multi-Format Output

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      reporter: [
        'text',           // Console summary
        'text-summary',   // Condensed console
        'html',           // Browsable report
        'lcov',           // For Codecov/Coveralls
        'json-summary',   // For CI parsing
        'cobertura',      // For Azure DevOps
      ],
    },
  },
});
```

### Coverage Badge Generation

```bash
# Extract coverage from JSON summary
COVERAGE=$(node -e "
  const summary = require('./coverage/coverage-summary.json');
  console.log(Math.round(summary.total.lines.pct));
")

# Generate badge URL
BADGE_URL="https://img.shields.io/badge/coverage-${COVERAGE}%25-brightgreen"
echo "Coverage: ${COVERAGE}%"
```

---

## Trend Tracking

### Historical Data Collection

```typescript
// scripts/record-test-metrics.ts
import { readFileSync, appendFileSync } from 'fs';

interface TestMetrics {
  timestamp: string;
  branch: string;
  commit: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_s: number;
  coverage_pct: number;
}

function recordMetrics() {
  const results = JSON.parse(readFileSync('test-results/results.json', 'utf-8'));
  const coverage = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf-8'));

  const metrics: TestMetrics = {
    timestamp: new Date().toISOString(),
    branch: process.env.GITHUB_REF_NAME || 'local',
    commit: process.env.GITHUB_SHA?.slice(0, 7) || 'local',
    total: results.suites.reduce((sum: number, s: any) => sum + s.specs.length, 0),
    passed: results.suites.reduce((sum: number, s: any) =>
      sum + s.specs.filter((sp: any) => sp.ok).length, 0),
    failed: results.suites.reduce((sum: number, s: any) =>
      sum + s.specs.filter((sp: any) => !sp.ok).length, 0),
    skipped: 0,
    duration_s: Math.round(results.stats.duration / 1000),
    coverage_pct: coverage.total.lines.pct,
  };

  appendFileSync('metrics/test-history.jsonl', JSON.stringify(metrics) + '\n');
}

recordMetrics();
```

---

## Flaky Test Reports

### Detecting Flakiness

```typescript
// scripts/flaky-report.ts
interface FlakyTest {
  name: string;
  file: string;
  passRate: number;
  totalRuns: number;
  lastFailure: string;
  failureReasons: string[];
}

function generateFlakyReport(history: TestRun[]): FlakyTest[] {
  const testStats = new Map<string, { passes: number; failures: number; reasons: string[] }>();

  for (const run of history) {
    for (const test of run.tests) {
      const key = `${test.file}::${test.name}`;
      const stats = testStats.get(key) || { passes: 0, failures: 0, reasons: [] };

      if (test.status === 'passed') stats.passes++;
      else if (test.status === 'failed') {
        stats.failures++;
        stats.reasons.push(test.error || 'unknown');
      }

      testStats.set(key, stats);
    }
  }

  return Array.from(testStats.entries())
    .filter(([, stats]) => stats.passes > 0 && stats.failures > 0)
    .map(([key, stats]) => ({
      name: key.split('::')[1],
      file: key.split('::')[0],
      passRate: stats.passes / (stats.passes + stats.failures),
      totalRuns: stats.passes + stats.failures,
      lastFailure: new Date().toISOString(),
      failureReasons: [...new Set(stats.reasons)].slice(0, 5),
    }))
    .sort((a, b) => a.passRate - b.passRate);
}
```

---

## CI Integration Patterns

### GitHub Actions Summary

```yaml
- name: Generate test summary
  if: always()
  run: |
    echo "## Test Results" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    node -e "
      const results = require('./test-results/results.json');
      const passed = results.numPassedTests;
      const failed = results.numFailedTests;
      const total = results.numTotalTests;
      console.log('| Metric | Value |');
      console.log('|--------|-------|');
      console.log('| Total | ' + total + ' |');
      console.log('| Passed | ' + passed + ' |');
      console.log('| Failed | ' + failed + ' |');
      console.log('| Duration | ' + (results.stats.duration / 1000).toFixed(1) + 's |');
    " >> $GITHUB_STEP_SUMMARY
```

### Slack Report

```typescript
async function sendSlackReport(webhookUrl: string, results: TestSummary) {
  const color = results.failed === 0 ? '#36a64f' : '#ff0000';
  const payload = {
    attachments: [{
      color,
      title: `Test Results: ${results.passed}/${results.total} passed`,
      fields: [
        { title: 'Branch', value: results.branch, short: true },
        { title: 'Duration', value: `${results.durationSeconds}s`, short: true },
        { title: 'Coverage', value: `${results.coveragePct}%`, short: true },
        { title: 'Failed', value: String(results.failed), short: true },
      ],
      footer: `Commit: ${results.commit}`,
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

---

## Best Practices

- Always generate machine-readable output (JUnit, JSON) for CI parsing
- Include screenshots and trace files as artifacts on failure
- Track trends over time to detect quality regression
- Separate report generation from test execution
- Keep reports accessible to non-technical stakeholders
- Archive reports for compliance and auditing purposes

---

## References

- Playwright reporters: https://playwright.dev/docs/test-reporters
- JUnit XML format: https://llg.cubic.org/docs/junit/
- Allure Framework: https://allurereport.org/
- GitHub Actions job summaries: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary

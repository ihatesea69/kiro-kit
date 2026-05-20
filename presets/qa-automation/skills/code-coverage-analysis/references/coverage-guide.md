# Code Coverage Analysis Guide

Comprehensive reference for measuring, analyzing, and improving test code coverage across different testing levels.

---

## Coverage Metrics

### Types of Coverage

| Metric | Description | Use Case |
|--------|-------------|----------|
| Statement | Lines executed at least once | Basic completeness |
| Branch | Each if/else path taken | Logic correctness |
| Function | Each function called | API surface validation |
| Line | Physical lines executed | Similar to statement |
| Condition | Boolean sub-expressions | Complex condition testing |
| MC/DC | Modified condition/decision | Safety-critical systems |

### Interpreting Coverage Numbers

- 80% statement coverage does not mean 80% of bugs are found
- Branch coverage reveals untested paths better than line coverage
- 100% coverage does not guarantee correctness
- Focus on covering critical paths and error handlers

---

## Configuration

### Istanbul/nyc (JavaScript/TypeScript)

```json
{
  "nyc": {
    "all": true,
    "include": ["src/**/*.ts"],
    "exclude": [
      "src/**/*.spec.ts",
      "src/**/*.test.ts",
      "src/**/index.ts",
      "src/**/*.d.ts"
    ],
    "reporter": ["text", "lcov", "html", "json-summary"],
    "branches": 80,
    "lines": 85,
    "functions": 85,
    "statements": 85,
    "check-coverage": true,
    "watermarks": {
      "lines": [70, 90],
      "functions": [70, 90],
      "branches": [70, 90],
      "statements": [70, 90]
    }
  }
}
```

### Vitest Coverage

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/types/**',
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
```

### Jest Coverage

```json
{
  "jest": {
    "collectCoverage": true,
    "collectCoverageFrom": [
      "src/**/*.{ts,tsx}",
      "!src/**/*.d.ts",
      "!src/**/index.ts"
    ],
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 85,
        "lines": 85,
        "statements": 85
      },
      "src/critical/**": {
        "branches": 95,
        "functions": 95,
        "lines": 95,
        "statements": 95
      }
    },
    "coverageReporters": ["text", "lcov", "html"]
  }
}
```

---

## Coverage in CI/CD

### Enforcing Thresholds in Pipeline

```yaml
- name: Run tests with coverage
  run: npm test -- --coverage

- name: Check coverage thresholds
  run: |
    npx nyc check-coverage \
      --branches 80 \
      --functions 85 \
      --lines 85 \
      --statements 85
```

### Coverage Diff Reporting

Show coverage impact on pull requests:

```yaml
- name: Coverage report
  uses: davelosert/vitest-coverage-report-action@v2
  with:
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
```

### Tracking Coverage Over Time

```bash
# Extract coverage from JSON summary
COVERAGE=$(node -e "
  const report = require('./coverage/coverage-summary.json');
  console.log(report.total.lines.pct);
")
echo "Current line coverage: ${COVERAGE}%"
```

---

## Analysis Techniques

### Finding Untested Code

```bash
# Generate HTML report and look for red/yellow highlights
npx nyc report --reporter=html
# Open coverage/index.html in browser

# List files below threshold
npx nyc report --reporter=text | grep -E "^\s+\d" | awk '$5 < 80 {print}'
```

### Coverage by Module

```typescript
// vitest.config.ts - per-module thresholds
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        'src/auth/**': {
          statements: 95,
          branches: 90,
        },
        'src/utils/**': {
          statements: 90,
          branches: 85,
        },
      },
    },
  },
});
```

### Identifying Dead Code

- Code with 0% coverage across all test suites may be dead code
- Cross-reference with static analysis tools
- Use tree-shaking reports from bundlers

---

## Best Practices

### Setting Meaningful Thresholds

- Start with current baseline, increase gradually
- Set higher thresholds for critical paths (auth, payments)
- Allow lower thresholds for UI/presentation code
- Never decrease thresholds without team discussion

### Coverage Anti-patterns

- Writing tests solely to increase coverage numbers
- Testing getters/setters with no logic
- Ignoring branch coverage in favor of line coverage
- Excluding files that should be tested

### Ratcheting Strategy

```json
{
  "scripts": {
    "coverage:check": "nyc check-coverage",
    "coverage:ratchet": "node scripts/ratchet-coverage.js"
  }
}
```

```javascript
// scripts/ratchet-coverage.js
const fs = require('fs');
const summary = require('../coverage/coverage-summary.json');

const thresholds = {
  lines: Math.floor(summary.total.lines.pct),
  branches: Math.floor(summary.total.branches.pct),
  functions: Math.floor(summary.total.functions.pct),
  statements: Math.floor(summary.total.statements.pct),
};

// Update .nycrc with new minimums (never decrease)
const config = JSON.parse(fs.readFileSync('.nycrc', 'utf8'));
for (const [key, value] of Object.entries(thresholds)) {
  config[key] = Math.max(config[key] || 0, value);
}
fs.writeFileSync('.nycrc', JSON.stringify(config, null, 2));
```

---

## References

- Istanbul documentation: https://istanbul.js.org/
- Vitest coverage: https://vitest.dev/guide/coverage
- Jest coverage: https://jestjs.io/docs/configuration#collectcoverage-boolean
- Martin Fowler on test coverage: https://martinfowler.com/bliki/TestCoverage.html

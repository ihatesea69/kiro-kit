# Mutation Testing Guide

Comprehensive reference for using mutation testing to evaluate and improve test suite effectiveness.

---

## Core Concepts

### What is Mutation Testing

Mutation testing introduces small changes (mutants) to production code and checks whether existing tests catch them. If a test fails when a mutant is introduced, the mutant is "killed." Surviving mutants indicate gaps in test coverage.

### Mutation Operators

| Category | Operator | Example |
|----------|----------|---------|
| Arithmetic | Replace + with - | `a + b` becomes `a - b` |
| Relational | Replace < with <= | `x < 10` becomes `x <= 10` |
| Logical | Replace && with \|\| | `a && b` becomes `a \|\| b` |
| Negation | Negate condition | `if (x)` becomes `if (!x)` |
| Return | Change return value | `return true` becomes `return false` |
| Remove | Delete statement | `list.add(item)` becomes empty |
| Boundary | Off-by-one | `i < n` becomes `i <= n` |

### Metrics

- **Mutation Score** = Killed Mutants / Total Mutants * 100
- **Survived** = Mutants not detected by any test
- **Equivalent** = Mutants that produce identical behavior (false positives)
- **Timeout** = Mutants causing infinite loops (counted as killed)

---

## Stryker Mutator (JavaScript/TypeScript)

### Installation and Configuration

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/typescript-checker @stryker-mutator/vitest-runner
npx stryker init
```

```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/core/schema/stryker-core.json",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/types/**"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  },
  "timeoutMS": 30000,
  "concurrency": 4
}
```

### Running Mutation Tests

```bash
# Full mutation run
npx stryker run

# Mutate specific files
npx stryker run --mutate "src/services/order.ts"

# Incremental mode (only re-test changes)
npx stryker run --incremental
```

### Interpreting Results

```
All files:
  Mutation score: 78.5%
  Mutants:
    Killed:    157
    Survived:   43
    Timeout:     8
    No coverage: 12

src/services/order.ts:
  Mutation score: 65.0%
  Survived mutants:
    Line 45: ConditionalExpression - replaced > with >=
    Line 72: ArithmeticOperator - replaced * with /
    Line 89: BooleanLiteral - replaced true with false
```

### Targeting Survived Mutants

```typescript
// Example: survived mutant on boundary condition
// Original:
function applyDiscount(total: number, threshold: number): number {
  if (total > threshold) {  // Mutant: total >= threshold survived
    return total * 0.9;
  }
  return total;
}

// The surviving mutant tells us we need a test at the boundary:
describe('applyDiscount', () => {
  it('applies discount when total exceeds threshold', () => {
    expect(applyDiscount(101, 100)).toBe(90.9);
  });

  // This test kills the >= mutant:
  it('does not apply discount when total equals threshold', () => {
    expect(applyDiscount(100, 100)).toBe(100);
  });

  it('does not apply discount below threshold', () => {
    expect(applyDiscount(99, 100)).toBe(99);
  });
});
```

---

## PIT (Java/Kotlin)

### Maven Configuration

```xml
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.15.0</version>
  <configuration>
    <targetClasses>
      <param>com.example.service.*</param>
    </targetClasses>
    <targetTests>
      <param>com.example.service.*Test</param>
    </targetTests>
    <mutators>
      <mutator>DEFAULTS</mutator>
      <mutator>REMOVE_CONDITIONALS</mutator>
    </mutators>
    <outputFormats>
      <param>HTML</param>
      <param>XML</param>
    </outputFormats>
    <mutationThreshold>75</mutationThreshold>
    <timestampedReports>false</timestampedReports>
  </configuration>
</plugin>
```

```bash
mvn org.pitest:pitest-maven:mutationCoverage
```

---

## CI Integration

### GitHub Actions

```yaml
- name: Run mutation tests
  run: npx stryker run --reporters progress,json
  continue-on-error: true

- name: Check mutation score
  run: |
    SCORE=$(node -e "
      const report = require('./reports/mutation/mutation.json');
      const score = (report.killed / (report.killed + report.survived)) * 100;
      console.log(score.toFixed(1));
    ")
    echo "Mutation score: ${SCORE}%"
    if (( $(echo "$SCORE < 60" | bc -l) )); then
      echo "Mutation score below threshold"
      exit 1
    fi
```

### Incremental Mutation Testing

Run mutation tests only on changed files for faster feedback:

```bash
# Get changed files
CHANGED=$(git diff --name-only HEAD~1 -- 'src/**/*.ts' | tr '\n' ',')

# Run mutations only on changed files
npx stryker run --mutate "$CHANGED"
```

---

## Best Practices

### When to Use Mutation Testing

- Validating test quality for critical business logic
- Finding weak spots in test suites with high line coverage
- Training team to write better assertions
- Code review: verifying new tests are meaningful

### Performance Optimization

- Use `coverageAnalysis: "perTest"` to skip irrelevant tests
- Limit scope to changed modules in CI
- Use incremental mode for iterative development
- Set reasonable timeouts to kill infinite-loop mutants quickly

### Handling Equivalent Mutants

- Mark known equivalent mutants in configuration
- Focus on reducing survived mutants in critical paths first
- Use `// Stryker disable next-line` for intentionally untested code
- Track mutation score trends over time rather than absolute numbers

---

## References

- Stryker Mutator: https://stryker-mutator.io/
- PIT Mutation Testing: https://pitest.org/
- Mutation testing theory: https://en.wikipedia.org/wiki/Mutation_testing
- Research: "An Analysis and Survey of the Development of Mutation Testing"

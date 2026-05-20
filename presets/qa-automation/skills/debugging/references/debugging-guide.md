# Test Debugging Guide

Comprehensive reference for diagnosing and resolving test failures in automated test suites.

---

## Debugging Strategies

### Systematic Approach

1. **Read the error message** - identify the assertion or exception
2. **Check the test context** - what state was expected vs actual
3. **Isolate the failure** - run only the failing test
4. **Add instrumentation** - screenshots, logs, traces
5. **Identify the root cause** - test issue vs application bug
6. **Fix and verify** - ensure the fix does not mask real issues

### Classifying Failures

| Type | Symptoms | Approach |
|------|----------|----------|
| Assertion failure | Expected vs actual mismatch | Check test data and app state |
| Timeout | Test exceeds time limit | Add waits, check network/services |
| Element not found | Locator returns null | Update selector, add wait conditions |
| Flaky | Passes sometimes | Race condition, timing, test order |
| Environment | Works locally, fails in CI | Check env vars, services, resources |

---

## Playwright Debugging

### Using Playwright Inspector

```bash
# Launch test with inspector UI
PWDEBUG=1 npx playwright test tests/checkout.spec.ts

# Run in headed mode with slow motion
npx playwright test --headed --slowmo=500
```

### Trace Viewer

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    trace: 'on-first-retry', // Capture trace on retry
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

```bash
# View trace after failure
npx playwright show-trace test-results/checkout-chromium/trace.zip
```

### Console and Network Logging

```typescript
import { test, expect } from '@playwright/test';

test('debug network requests', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  page.on('request', (req) => {
    requests.push(`${req.method()} ${req.url()}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      errors.push(`HTTP ${res.status()} - ${res.url()}`);
    }
  });

  await page.goto('/checkout');
  await page.click('[data-testid="submit-order"]');

  // Log collected data on failure
  if (errors.length > 0) {
    console.log('Console errors:', errors);
    console.log('Requests made:', requests);
  }
});
```

### Screenshot Comparison

```typescript
test('visual state at failure point', async ({ page }) => {
  await page.goto('/dashboard');

  // Take screenshot before interaction
  await page.screenshot({ path: 'debug/before-click.png' });

  await page.click('[data-testid="load-data"]');
  await page.waitForLoadState('networkidle');

  // Take screenshot after interaction
  await page.screenshot({ path: 'debug/after-click.png', fullPage: true });

  await expect(page.locator('.data-table')).toBeVisible();
});
```

---

## Common Failure Patterns

### Timing and Race Conditions

```typescript
// BAD: Fixed wait
await page.waitForTimeout(3000);
await page.click('#submit');

// GOOD: Wait for specific condition
await page.waitForSelector('#submit:not([disabled])');
await page.click('#submit');

// GOOD: Wait for network to settle
await page.waitForLoadState('networkidle');

// GOOD: Wait for specific response
const responsePromise = page.waitForResponse('**/api/orders');
await page.click('#submit');
await responsePromise;
```

### Stale Element References

```typescript
// BAD: Store reference, use later
const button = page.locator('#dynamic-button');
await page.reload();
await button.click(); // May reference stale DOM

// GOOD: Re-query after state change
await page.reload();
await page.locator('#dynamic-button').click();
```

### Test Isolation Failures

```typescript
// Each test should set up its own state
test.beforeEach(async ({ page, request }) => {
  // Reset to known state via API
  await request.post('/api/test/reset');
  await request.post('/api/test/seed', {
    data: { scenario: 'basic-user' },
  });
});

test.afterEach(async ({ request }) => {
  // Clean up test data
  await request.delete('/api/test/cleanup');
});
```

---

## CI-Specific Debugging

### Reproducing CI Failures Locally

```bash
# Match CI environment
docker run --rm -it \
  -v $(pwd):/workspace \
  -w /workspace \
  mcr.microsoft.com/playwright:v1.40.0-focal \
  npx playwright test tests/failing-test.spec.ts

# Run with same env vars as CI
CI=true HEADLESS=true npx playwright test
```

### Analyzing CI Artifacts

```bash
# Download and inspect trace
npx playwright show-trace ./downloaded-trace.zip

# Check screenshots for visual clues
open ./test-results/screenshots/

# Review video recordings
open ./test-results/videos/
```

### Resource Constraints

```typescript
// Detect CI resource issues
test.beforeAll(async () => {
  if (process.env.CI) {
    // Log available resources
    const { execSync } = require('child_process');
    console.log('Memory:', execSync('free -m').toString());
    console.log('CPU:', execSync('nproc').toString());
    console.log('Disk:', execSync('df -h /').toString());
  }
});
```

---

## Logging and Instrumentation

### Structured Test Logging

```typescript
import { test } from '@playwright/test';

// Create a custom logger for test debugging
function testLog(context: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${context}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

test('order submission with logging', async ({ page }) => {
  testLog('setup', 'Navigating to checkout');
  await page.goto('/checkout');

  testLog('action', 'Filling form fields');
  await page.fill('#email', 'test@example.com');

  testLog('action', 'Submitting order');
  const response = await page.waitForResponse('**/api/orders');
  testLog('verify', 'Response received', {
    status: response.status(),
    url: response.url(),
  });
});
```

### API Response Logging

```typescript
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const response = await route.fetch();
    const body = await response.json().catch(() => null);

    console.log(`API: ${route.request().method()} ${route.request().url()}`);
    console.log(`  Status: ${response.status()}`);
    if (response.status() >= 400) {
      console.log(`  Error body:`, body);
    }

    await route.fulfill({ response });
  });
});
```

---

## Flaky Test Diagnosis

### Identifying Flakiness

```bash
# Run test multiple times to detect flakiness
npx playwright test tests/suspect.spec.ts --repeat-each=10

# Run with different worker counts
npx playwright test --workers=1  # Sequential
npx playwright test --workers=4  # Parallel (may expose race conditions)
```

### Common Flakiness Causes

- Animation timing (add `animations: 'disabled'` to config)
- Network variability (mock external APIs)
- Shared mutable state between tests
- Clock-dependent logic (use `page.clock`)
- Random data without fixed seeds

---

## References

- Playwright debugging: https://playwright.dev/docs/debug
- Playwright trace viewer: https://playwright.dev/docs/trace-viewer
- Test isolation: https://playwright.dev/docs/browser-contexts
- CI debugging: https://playwright.dev/docs/ci

# Visual Regression Testing Guide

Comprehensive reference for detecting unintended visual changes in web applications using automated screenshot comparison.

---

## Core Concepts

### How Visual Regression Works

1. Capture baseline screenshots of UI components/pages
2. Run tests after code changes
3. Compare new screenshots against baselines pixel-by-pixel or perceptually
4. Flag differences exceeding a threshold
5. Review and approve intentional changes (update baseline)

### Comparison Methods

| Method | Sensitivity | Use Case |
|--------|-------------|----------|
| Pixel-by-pixel | Very high | Critical UI elements |
| Perceptual diff | Medium | General page layout |
| Structural (DOM) | Low | Content-focused |
| AI-powered | Adaptive | Complex dynamic UIs |

---

## Playwright Visual Comparisons

### Basic Screenshot Comparison

```typescript
import { test, expect } from '@playwright/test';

test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Full page screenshot comparison
  await expect(page).toHaveScreenshot('homepage.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});

test('component visual regression', async ({ page }) => {
  await page.goto('/components/button');

  const button = page.locator('[data-testid="primary-button"]');
  await expect(button).toHaveScreenshot('primary-button.png');
});
```

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,    // Allow 1% pixel difference
      maxDiffPixels: 100,          // Or max 100 different pixels
      threshold: 0.2,              // Color difference threshold (0-1)
      animations: 'disabled',      // Disable CSS animations
    },
  },
  use: {
    // Consistent viewport for screenshots
    viewport: { width: 1280, height: 720 },
    // Disable system animations
    reducedMotion: 'reduce',
  },
});
```

### Handling Dynamic Content

```typescript
test('dashboard with dynamic data', async ({ page }) => {
  await page.goto('/dashboard');

  // Mask dynamic content before screenshot
  await page.evaluate(() => {
    // Hide timestamps
    document.querySelectorAll('[data-testid="timestamp"]').forEach((el) => {
      (el as HTMLElement).textContent = '2024-01-01 00:00:00';
    });
    // Hide user avatars (may vary)
    document.querySelectorAll('.avatar').forEach((el) => {
      (el as HTMLElement).style.visibility = 'hidden';
    });
  });

  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [
      page.locator('[data-testid="live-counter"]'),
      page.locator('[data-testid="random-ad"]'),
    ],
  });
});
```

### Multi-Browser Visual Testing

```typescript
import { test, expect } from '@playwright/test';

test.describe('cross-browser visual consistency', () => {
  test('navigation bar renders consistently', async ({ page, browserName }) => {
    await page.goto('/');

    await expect(page.locator('nav')).toHaveScreenshot(
      `navbar-${browserName}.png`,
      { maxDiffPixelRatio: 0.02 }
    );
  });
});
```

---

## Responsive Visual Testing

### Testing Across Breakpoints

```typescript
import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const vp of viewports) {
  test(`product page at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/products/featured');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`product-page-${vp.name}.png`, {
      fullPage: true,
    });
  });
}
```

### Dark/Light Theme Testing

```typescript
test.describe('theme visual regression', () => {
  test('light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');

    await expect(page).toHaveScreenshot('settings-light.png');
  });

  test('dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');

    await expect(page).toHaveScreenshot('settings-dark.png');
  });
});
```

---

## Component-Level Visual Testing

### Storybook Integration

```typescript
// Using storybook test runner with visual snapshots
import type { TestRunnerConfig } from '@storybook/test-runner';

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    // Wait for story to fully render
    await page.waitForLoadState('networkidle');

    const element = await page.$('#storybook-root');
    if (element) {
      const screenshot = await element.screenshot();
      expect(screenshot).toMatchSnapshot(
        `${context.title}--${context.name}.png`
      );
    }
  },
};

export default config;
```

### Component State Coverage

```typescript
test.describe('Button component states', () => {
  const states = ['default', 'hover', 'focus', 'disabled', 'loading'];

  for (const state of states) {
    test(`button ${state} state`, async ({ page }) => {
      await page.goto(`/components/button?state=${state}`);
      const button = page.locator('[data-testid="demo-button"]');

      if (state === 'hover') {
        await button.hover();
      } else if (state === 'focus') {
        await button.focus();
      }

      await expect(button).toHaveScreenshot(`button-${state}.png`);
    });
  }
});
```

---

## CI Integration

### Updating Baselines

```bash
# Update all baselines
npx playwright test --update-snapshots

# Update specific test baselines
npx playwright test tests/visual/ --update-snapshots

# Update baselines in CI (typically on main branch merge)
npx playwright test --update-snapshots
git add tests/**/*.png
git commit -m "chore: update visual baselines"
```

### GitHub Actions Workflow

```yaml
jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Run visual tests
        run: npx playwright test tests/visual/

      - name: Upload diff artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-diffs
          path: |
            test-results/**/*-diff.png
            test-results/**/*-actual.png
            test-results/**/*-expected.png
```

### Review Process

When visual tests fail in a PR:

1. Download diff artifacts from CI
2. Compare expected vs actual vs diff images
3. If change is intentional: update baselines and push
4. If change is unintentional: fix the regression

---

## Anti-Patterns and Solutions

### Flaky Visual Tests

| Problem | Solution |
|---------|----------|
| Font rendering differences | Use consistent Docker image for CI |
| Animation timing | Disable animations in config |
| Dynamic content | Mask or replace with static content |
| Subpixel rendering | Increase threshold slightly |
| Date/time display | Mock clock or mask elements |

### Performance Considerations

- Limit full-page screenshots to critical pages
- Use component-level screenshots for most tests
- Run visual tests in a separate CI job (optional, non-blocking)
- Cache browser installations between runs
- Use sharding for large visual test suites

---

## Best Practices

- Store baseline images in version control alongside tests
- Use consistent environments (Docker) for baseline generation
- Set reasonable thresholds (0.01-0.05 pixel ratio for most cases)
- Disable animations and transitions in test configuration
- Test each viewport/theme combination independently
- Review visual diffs carefully before approving baseline updates
- Separate visual tests from functional tests for faster feedback

---

## References

- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Percy (BrowserStack): https://www.browserstack.com/percy
- Chromatic (Storybook): https://www.chromatic.com/
- BackstopJS: https://github.com/garris/BackstopJS
- Applitools: https://applitools.com/

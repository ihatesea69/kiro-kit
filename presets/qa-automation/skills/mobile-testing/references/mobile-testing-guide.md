# Mobile Testing Guide

Comprehensive reference for testing mobile applications and responsive web experiences across devices and platforms.

---

## Mobile Testing Categories

### Testing Types

| Type | Tools | Scope |
|------|-------|-------|
| Unit | Jest, XCTest, JUnit | Business logic |
| Component | Testing Library, Detox | UI components |
| Integration | Appium, Detox | Screen flows |
| E2E | Playwright Mobile, Appium | Full user journeys |
| Visual | Percy, Chromatic | UI consistency |
| Performance | Lighthouse, WebPageTest | Load and render speed |
| Accessibility | axe-core, Accessibility Inspector | Inclusive UX |

---

## Playwright Mobile Emulation

### Device Configuration

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        locale: 'en-US',
        permissions: ['geolocation'],
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
        locale: 'en-US',
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro 11'],
      },
    },
  ],
});
```

### Touch and Gesture Testing

```typescript
import { test, expect } from '@playwright/test';

test('swipe to delete item', async ({ page }) => {
  await page.goto('/mobile/inbox');

  const item = page.locator('[data-testid="message-1"]');
  const box = await item.boundingBox();

  if (box) {
    // Swipe left gesture
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
  }

  await expect(page.locator('[data-testid="delete-action"]')).toBeVisible();
});

test('pinch to zoom', async ({ page }) => {
  await page.goto('/mobile/map');

  // Use touch events for multi-touch gestures
  await page.evaluate(() => {
    const map = document.querySelector('[data-testid="map"]');
    if (!map) return;

    const touch1 = new Touch({ identifier: 1, target: map, clientX: 150, clientY: 200 });
    const touch2 = new Touch({ identifier: 2, target: map, clientX: 250, clientY: 200 });

    map.dispatchEvent(new TouchEvent('touchstart', {
      touches: [touch1, touch2],
      changedTouches: [touch1, touch2],
    }));
  });
});
```

### Responsive Breakpoint Testing

```typescript
import { test, expect } from '@playwright/test';

const breakpoints = [
  { name: 'mobile-sm', width: 320, height: 568 },
  { name: 'mobile-md', width: 375, height: 812 },
  { name: 'mobile-lg', width: 414, height: 896 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const bp of breakpoints) {
  test(`navigation menu at ${bp.name} (${bp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto('/');

    if (bp.width < 768) {
      // Mobile: hamburger menu should exist
      await expect(page.locator('[data-testid="hamburger-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="desktop-nav"]')).toBeHidden();
    } else {
      // Desktop: full nav visible
      await expect(page.locator('[data-testid="desktop-nav"]')).toBeVisible();
    }
  });
}
```

---

## Appium Testing

### Configuration

```typescript
// wdio.conf.ts for Appium
export const config: WebdriverIO.Config = {
  runner: 'local',
  port: 4723,
  path: '/',
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Pixel_6_API_33',
    'appium:app': './app/build/outputs/apk/debug/app-debug.apk',
    'appium:appWaitActivity': 'com.example.app.MainActivity',
  }],
  framework: 'mocha',
  mochaOpts: { timeout: 60000 },
};
```

### Native App Test

```typescript
describe('Login Flow', () => {
  it('should login with valid credentials', async () => {
    const emailField = await $('~email-input');
    await emailField.setValue('user@example.com');

    const passwordField = await $('~password-input');
    await passwordField.setValue('password123');

    const loginButton = await $('~login-button');
    await loginButton.click();

    const welcomeMessage = await $('~welcome-text');
    await expect(welcomeMessage).toHaveText('Welcome back!');
  });

  it('should handle network errors gracefully', async () => {
    // Toggle airplane mode to simulate network failure
    await driver.toggleAirplaneMode();

    const loginButton = await $('~login-button');
    await loginButton.click();

    const errorMessage = await $('~error-toast');
    await expect(errorMessage).toBeDisplayed();
    await expect(errorMessage).toHaveText('No network connection');

    // Restore network
    await driver.toggleAirplaneMode();
  });
});
```

---

## Detox (React Native)

### Test Example

```typescript
import { device, element, by, expect } from 'detox';

describe('Shopping Cart', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should add item to cart', async () => {
    await element(by.id('product-list')).scrollTo('bottom');
    await element(by.id('product-item-1')).tap();
    await element(by.id('add-to-cart-button')).tap();

    await expect(element(by.id('cart-badge'))).toHaveText('1');
  });

  it('should handle pull-to-refresh', async () => {
    const list = element(by.id('product-list'));
    await list.swipe('down', 'slow', 0.5);

    await waitFor(element(by.id('refresh-indicator')))
      .toBeNotVisible()
      .withTimeout(5000);
  });
});
```

---

## Mobile-Specific Concerns

### Network Conditions

```typescript
// Playwright network throttling
await page.route('**/*', async (route) => {
  // Simulate 3G network
  await new Promise((resolve) => setTimeout(resolve, 300));
  await route.continue();
});

// Test offline behavior
await page.context().setOffline(true);
await page.click('[data-testid="submit"]');
await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible();
await page.context().setOffline(false);
```

### Device Orientation

```typescript
test('handles orientation change', async ({ page }) => {
  // Portrait
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('.sidebar')).toBeHidden();

  // Landscape
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(page.locator('.sidebar')).toBeVisible();
});
```

### Battery and Performance

- Test behavior when device is in low-power mode
- Verify animations respect reduced-motion preferences
- Check that background tasks pause when app is backgrounded
- Validate data usage is reasonable on metered connections

---

## Best Practices

- Test on real devices for final validation (emulators miss hardware-specific bugs)
- Cover both iOS and Android behavior differences
- Test with accessibility features enabled (VoiceOver, TalkBack)
- Validate deep linking and app-to-web transitions
- Test push notification handling in various app states
- Verify proper keyboard handling (show/hide, input focus)

---

## References

- Playwright mobile emulation: https://playwright.dev/docs/emulation
- Appium documentation: https://appium.io/docs/en/latest/
- Detox: https://wix.github.io/Detox/
- BrowserStack device testing: https://www.browserstack.com/docs/app-automate

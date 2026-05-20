# Mobile Testing Guide

## Testing Types

- Responsive Web: viewport-based testing in mobile browsers
- Mobile Browser: actual mobile browser automation
- Native App: platform-specific app testing
- Hybrid App: webview-based applications

## Viewport Testing

- iPhone SE: 375x667
- iPhone 14: 390x844
- Pixel 7: 412x915
- iPad: 768x1024
- iPad Pro: 1024x1366

## Tools

- Playwright: mobile browser emulation
- Appium: native and hybrid app automation
- BrowserStack/Sauce Labs: real device cloud
- XCUITest: iOS native testing
- Espresso: Android native testing

## Best Practices

- Test critical flows on top 3-5 device sizes
- Verify touch targets meet minimum size (44x44px)
- Test both portrait and landscape orientations
- Validate offline behavior and slow network
- Check accessibility on mobile (screen readers, font scaling)

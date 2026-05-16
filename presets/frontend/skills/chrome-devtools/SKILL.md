---
name: chrome-devtools
description: Browser automation, debugging, and performance analysis using Puppeteer or Playwright. Use for taking screenshots, analyzing performance, monitoring network, or automating browser interactions.
---

# Chrome DevTools

Activate this skill when you need browser automation, screenshots, performance profiling, or network analysis.

## When to Use

- Taking screenshots of UI for review or comparison
- Analyzing page performance (Lighthouse, Core Web Vitals)
- Monitoring network requests and responses
- Automating browser interactions for testing
- Debugging rendering issues or layout problems
- Capturing console errors and warnings

## Puppeteer/Playwright Usage

```javascript
// Screenshot capture
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:3000');
await page.screenshot({ path: 'screenshot.png', fullPage: true });
await browser.close();
```

## Performance Analysis

- Run Lighthouse audits programmatically
- Measure Core Web Vitals (LCP, INP, CLS)
- Profile JavaScript execution time
- Analyze network waterfall for bottlenecks
- Check resource sizes and compression

## Network Monitoring

- Intercept and log API requests
- Verify response payloads and status codes
- Check for failed requests or slow responses
- Monitor WebSocket connections

## Debugging

- Capture console.log, console.error output
- Screenshot on test failure for debugging
- Compare visual snapshots for regression detection
- Inspect DOM structure and computed styles

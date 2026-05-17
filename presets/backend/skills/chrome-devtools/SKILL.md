---
name: chrome-devtools
description: >-
  Browser automation and debugging using Puppeteer for API testing, screenshot
  capture, and web scraping. Use when you need to interact with web interfaces
  programmatically.
license: Apache-2.0
---

# Chrome DevTools

Activate this skill when automating browsers, testing web interfaces, or capturing screenshots.

## When to Use

- Testing API documentation UIs
- Capturing screenshots of admin panels
- Automating form submissions for testing
- Debugging web-based monitoring dashboards
- Scraping data from web interfaces

## Puppeteer Usage

```javascript
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000');
await page.screenshot({ path: 'screenshot.png' });
await browser.close();
```

## Common Operations

- Navigate to URLs and wait for network idle
- Fill forms and click buttons
- Take full-page or element screenshots
- Extract text content from pages
- Monitor network requests and responses
- Execute JavaScript in page context

## Rules

- Always close browser instances after use
- Set appropriate timeouts for page loads
- Use headless mode for CI environments
- Handle navigation errors gracefully
- Respect rate limits when scraping

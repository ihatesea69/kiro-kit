# Requirements Document

## Introduction

This spec governs a focused performance-engineering engagement that optimises an existing Next.js App Router application to meet Google's Core Web Vitals thresholds: LCP < 2.5 s (with an aspirational target of 2.0 s as Google tightens thresholds), INP < 200 ms (the single most-failed CWV metric — 43 % of sites currently fail it), and CLS < 0.1. The work covers image optimisation, font loading, JavaScript task scheduling, critical-CSS inlining, code splitting, CDN and SSR configuration, and the instrumentation of both Real-User Monitoring (RUM) and synthetic CI tests to prevent regressions.

## Glossary

- **LCP**: Largest Contentful Paint — the time from navigation start until the largest visible image or text block is painted. Google threshold: < 2.5 s (Good), < 4.0 s (Needs Improvement), ≥ 4.0 s (Poor). Aspirational target for 2026+: < 2.0 s.
- **INP**: Interaction to Next Paint — the worst-case latency from user input (click, keypress, tap) to the browser completing the next paint. Google threshold: < 200 ms (Good), < 500 ms (Needs Improvement), ≥ 500 ms (Poor). 43 % of sites currently fail the Good threshold.
- **CLS**: Cumulative Layout Shift — the aggregate measure of unexpected visual instability. Google threshold: < 0.1 (Good), < 0.25 (Needs Improvement), ≥ 0.25 (Poor).
- **TTFB**: Time to First Byte — the time from the start of the navigation to the first byte of the response. Good threshold: < 800 ms.
- **FCP**: First Contentful Paint — the time until the browser renders the first piece of DOM content.
- **Long Task**: A JavaScript task that occupies the main thread for > 50 ms, blocking input processing and raising INP.
- **Yield**: Returning control to the browser's event loop mid-computation, typically via `await scheduler.yield()` or `setTimeout(fn, 0)`.
- **RUM**: Real-User Monitoring — collection of performance data from actual visitors using the `web-vitals` library, sent to an analytics or observability endpoint.
- **Synthetic Test**: A performance test run in a controlled lab environment (Lighthouse CI in a GitHub Actions pipeline), producing reproducible scores.
- **AVIF**: AV1 Image Format — a modern image codec with superior compression to WebP and JPEG; supported in all major browsers as of 2024.
- **Critical CSS**: The subset of CSS rules needed to render above-the-fold content; inlined in `<style>` in the document `<head>` to eliminate render-blocking stylesheet fetches.
- **Code Splitting**: Dividing JavaScript into separate chunks that are loaded on demand rather than in a single bundle.
- **`font-display: swap`**: A CSS descriptor that instructs the browser to show fallback text immediately while the custom font loads, preventing invisible text (FOIT).
- **`scheduler.yield()`**: A proposed (now in WICG draft and implemented in Chrome) API for yielding to the browser event loop between long-running JS operations.
- **INP Attribution**: Identifying which DOM event handler or rendering phase caused a specific high-INP interaction, using `PerformanceObserver` `event` entries with `interactionId`.

## Out of Scope

- Redesigning or restructuring product features — changes are limited to performance-related code paths (images, fonts, JS scheduling, CSS, caching headers).
- Backend API performance optimisation — database query tuning, service-level latency, or infrastructure scaling are handled separately.
- Native mobile app performance (React Native/Expo) — web only.
- Third-party script removal or replacement (ads, chat widgets) — this spec audits and yields around them but does not remove them.
- Service Worker and offline-first caching — a separate Progressive Web App spec.
- Accessibility improvements beyond what directly overlaps with performance (e.g., large-text reflows) — covered in a dedicated accessibility spec.
- Visual regression testing — out of scope for this performance engagement.

## Requirements

### Requirement 1: LCP Optimisation — Hero Image and Critical Resources

**User Story:** As a visitor loading the application on a mobile device over a 4G connection, I want the page's primary content to appear within 2.5 seconds of navigation, so that I am not deterred by a slow-loading experience before seeing the product.

#### Acceptance Criteria

1. WHEN the LCP element is an image THE SYSTEM SHALL convert it to AVIF format with a WebP fallback using Next.js `<Image>` or `<picture>` element with explicit `width` and `height` attributes, and serve it through the Next.js Image Optimizer (or a CDN-backed equivalent); the AVIF file size must be ≤ 60 % of the equivalent JPEG at the same visual quality.
2. WHEN the LCP image is identified THE SYSTEM SHALL add `priority={true}` (or equivalent `<link rel="preload" as="image" fetchpriority="high">`) so the browser discovers and begins fetching it during the HTML parse, not after JavaScript executes.
3. WHEN the application is rendered on the server THE SYSTEM SHALL inline critical CSS (the styles required to render above-the-fold content without layout shift) into the document `<head>` as a `<style>` element; no render-blocking external CSS `<link>` tag may appear before the `</head>` for above-the-fold styles.
4. WHEN web fonts are loaded THE SYSTEM SHALL add `<link rel="preload" as="font" crossorigin>` for each font file needed for above-the-fold text and set `font-display: swap` in every `@font-face` declaration; no font fetch must block FCP.
5. IF a third-party script (analytics, chat, ads) is loaded on a page where it is not needed above the fold THE SYSTEM SHALL load it with `<Script strategy="afterInteractive">` or `<Script strategy="lazyOnload">` so it does not compete with the LCP resource for network bandwidth.
6. WHEN Lighthouse CI runs in the GitHub Actions pipeline THE SYSTEM SHALL assert that the `largest-contentful-paint` audit value is < 2 500 ms on a simulated Moto G Power (4G, 6× CPU throttle) profile; a failure must block the pull request merge.

### Requirement 2: INP Optimisation — Interaction Responsiveness

**User Story:** As a user interacting with the application (clicking buttons, typing in inputs, opening dropdowns), I want the page to respond and repaint within 200 milliseconds of my input, so that the interface feels immediate and does not feel laggy or unresponsive.

#### Acceptance Criteria

1. WHEN any event handler in the application runs THE SYSTEM SHALL ensure no single handler synchronously executes > 50 ms of JavaScript without yielding to the main thread; handlers that must process large datasets or perform DOM updates must break work into chunks using `await scheduler.yield()` (with a `setTimeout(fn, 0)` polyfill for browsers that do not support `scheduler.yield`).
2. WHEN a React state update is triggered by a user interaction THE SYSTEM SHALL classify the update as urgent (via `startTransition` NOT used — i.e., using default synchronous `setState`) only when the immediate visual response is critical (e.g., marking a checkbox); deferred, expensive re-renders (filtering a long list, re-sorting a table) MUST be wrapped in `React.startTransition` so the browser can process higher-priority events.
3. WHEN a list of more than 100 items is rendered THE SYSTEM SHALL use a windowing library (`@tanstack/react-virtual` or `react-window`) to limit DOM nodes to the visible viewport plus a configurable overscan of 5 rows, preventing the main-thread cost of rendering thousands of off-screen elements.
4. WHEN a heavy Client Component (a chart library, a rich text editor, or a data grid) is imported THE SYSTEM SHALL use `next/dynamic` with `{ ssr: false }` and display a lightweight skeleton fallback during loading, preventing the main-thread parse and execution cost of the library from occurring synchronously on the page load critical path.
5. IF the `PerformanceObserver` `event` entry for any user interaction on any page has `duration > 200 ms` in production RUM data THE SYSTEM SHALL attribute the offending handler using `interactionId` and create a tracked issue with the component name, event type, and measured `duration`; the issue must be resolved before the next release.
6. WHEN Lighthouse CI runs in the GitHub Actions pipeline THE SYSTEM SHALL assert that the `total-blocking-time` audit value is < 200 ms (a lab proxy for INP); a failure must block the pull request merge.

### Requirement 3: CLS Prevention — Layout Stability

**User Story:** As a visitor viewing the page as it loads, I want content to remain stable and not jump around unexpectedly, so that I do not accidentally click the wrong element or lose my reading position.

#### Acceptance Criteria

1. WHERE any `<img>`, `<Image>`, `<video>`, or `<iframe>` element is rendered THE SYSTEM SHALL set explicit `width` and `height` attributes (or a fixed-aspect-ratio CSS container using `aspect-ratio` property) so the browser reserves layout space before the media loads; no image or video element may have unknown intrinsic dimensions at parse time.
2. WHERE web fonts are loaded THE SYSTEM SHALL use the CSS `size-adjust` and `ascent-override` descriptors on the fallback font-face declaration to match the fallback font's metrics to the web font's metrics, minimising text reflow when the custom font swaps in (font-based CLS).
3. WHEN content is dynamically injected into the page after the initial render (e.g., a cookie consent banner, a notification toast, a lazy-loaded recommendation widget) THE SYSTEM SHALL position the injected content so it does not push existing layout elements downward; use fixed/absolute positioning or reserve explicit space in the layout before injection.
4. IF an animation uses CSS properties other than `transform` and `opacity` (e.g., animating `height`, `top`, `margin`) THE SYSTEM SHALL be refactored to use `transform: translateY()` or `opacity` exclusively, as layout-triggering properties cause CLS and are not GPU-composited.
5. WHEN Lighthouse CI runs THE SYSTEM SHALL assert that the `cumulative-layout-shift` audit score is < 0.1; a failure must block the pull request merge.
6. WHERE `next/font` is used for font loading THE SYSTEM SHALL configure it with the `adjustFontFallback: true` option so Next.js automatically generates the size-adjust fallback metrics, eliminating manual `@font-face` override authoring.

### Requirement 4: Code Splitting and JavaScript Bundle Optimisation

**User Story:** As a developer maintaining the application, I want the JavaScript delivered to each page to be limited to only what that page needs, so that parse and execution time does not unnecessarily inflate INP and TBT scores.

#### Acceptance Criteria

1. WHEN `next build` is run THE SYSTEM SHALL produce route-level code-split bundles; no page's initial JavaScript payload (excluding shared framework chunks) shall exceed 150 KB gzipped, measured via `@next/bundle-analyzer`; pages currently exceeding this limit must be refactored with dynamic imports or Server Component migration.
2. WHEN a heavy dependency (e.g., `date-fns`, `lodash`, `recharts`, a PDF renderer) is used on a single route THE SYSTEM SHALL import only the required functions (named imports or subpath imports) rather than the entire package, and verify via `@next/bundle-analyzer` that the dependency appears only in the relevant route chunk, not in the shared `_app` chunk.
3. WHEN a component is used only on interaction (e.g., a modal, a date picker, a file upload dialog) THE SYSTEM SHALL load it with `next/dynamic(() => import('./HeavyModal'))` and display a fallback until the chunk loads; the component must not be present in the initial page bundle.
4. WHEN tree-shaking is applied THE SYSTEM SHALL ensure `package.json` has `"sideEffects": false` (or a specific list of side-effect files) so unused exports from the project's own utility files are excluded from bundles.
5. WHERE `console.log`, `console.warn`, and debug-only code paths exist in production bundles THE SYSTEM SHALL strip them via a `terser` or `swc` configuration that removes debug statements when `NODE_ENV === 'production'`.
6. WHEN `next build` is run as part of CI THE SYSTEM SHALL run `node scripts/check-bundle-size.js` which reads the Next.js build manifest and asserts that no route's JS payload exceeds the 150 KB gzip limit, failing the build if the threshold is breached.

### Requirement 5: CDN and TTFB Optimisation

**User Story:** As a visitor in a geographic region far from the application's primary hosting region, I want the server to respond quickly to my requests, so that the total page load time is not dominated by network round-trip latency.

#### Acceptance Criteria

1. WHEN a Next.js page is classified as statically renderable (no per-request dynamic data) THE SYSTEM SHALL use `export const dynamic = 'force-static'` or `generateStaticParams` to pre-render it at build time and serve it from the CDN edge, targeting a TTFB < 200 ms for cached edge responses.
2. WHEN a Next.js page requires per-request data (dynamic rendering) THE SYSTEM SHALL add appropriate `Cache-Control: s-maxage=N, stale-while-revalidate=N` response headers (or Vercel `revalidate` config) so the CDN can serve stale content while revalidating in the background, reducing TTFB for repeat visitors.
3. WHEN the application is deployed THE SYSTEM SHALL configure `next.config.js` to set `compress: true` (Brotli/gzip compression for JS, CSS, and HTML responses) and confirm via response headers in CI (`Content-Encoding: br`) that compression is active.
4. WHERE external API calls are made from Server Components THE SYSTEM SHALL cache the results with the appropriate `fetch` cache options (`{ next: { revalidate: N } }` or `{ cache: 'force-cache' }`) so that multiple concurrent requests for the same page do not fan out to the origin unnecessarily.
5. WHEN Lighthouse CI runs THE SYSTEM SHALL assert that the `server-response-time` audit value is < 800 ms (TTFB Good threshold); persistent failures must be escalated to infrastructure for edge-region configuration.

### Requirement 6: Real-User Monitoring and Regression Prevention

**User Story:** As a developer or engineering lead, I want to be alerted when a code change degrades Core Web Vitals in production, so that performance regressions are caught before they affect a significant portion of users.

#### Acceptance Criteria

1. WHEN the application is running in a user's browser THE SYSTEM SHALL collect CWV data using the `web-vitals` library (v4+), capturing `LCP`, `INP`, `CLS`, `FCP`, and `TTFB` metric objects and sending them to the RUM endpoint (`NEXT_PUBLIC_RUM_ENDPOINT`) via `navigator.sendBeacon` with a JSON payload `{ name, value, rating, navigationType, url, deviceCategory }`.
2. WHEN a CWV metric is collected THE SYSTEM SHALL also include `{ attribution }` from the `web-vitals` attribution build to identify the LCP element, the INP interaction target, and the CLS shift source in the RUM payload, enabling fast root-cause analysis.
3. WHEN a CWV metric value is in the "Poor" band (LCP ≥ 4 000 ms, INP ≥ 500 ms, CLS ≥ 0.25) THE SYSTEM SHALL fire an additional event `{ event: 'cwv_poor', metric: name, value, url }` to the analytics endpoint so that engineering dashboards can alert on deterioration.
4. WHEN a pull request is opened against the `main` branch THE SYSTEM SHALL run a Lighthouse CI job (`.github/workflows/lighthouse.yml`) that audits at least the home page, one dynamic page, and one data-heavy page using `lighthouse-ci` with the `@lhci/cli` package; the job must assert LCP < 2 500 ms, CLS < 0.1, and TBT < 200 ms; failure must block merge.
5. WHEN the Lighthouse CI job completes THE SYSTEM SHALL upload the `.lighthouseci/` report directory as a GitHub Actions artifact and post a comment to the pull request with a summary table of LCP, CLS, TBT, and Performance score for each audited URL.
6. IF the RUM endpoint is unavailable THE SYSTEM SHALL fail silently — the `sendBeacon` call is wrapped in a `try/catch`; no error is surfaced to the user; the failure is logged to `console.warn` in non-production environments only.

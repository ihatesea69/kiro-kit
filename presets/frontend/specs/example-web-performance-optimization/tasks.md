# Implementation Plan: Web Performance Optimization

## Overview

This plan delivers Core Web Vitals improvements in dependency order: observability first (so every subsequent change is measurable), then LCP fixes, then CLS fixes, then INP fixes, then JavaScript bundle reduction, then CDN/TTFB, and finally synthetic CI gates. Each task produces a self-contained, measurable increment. Tasks marked `*` are optional and can be deferred without blocking later work.

## Tasks

- [ ] 1. Instrument Real-User Monitoring (RUM)
  - [ ] 1.1 Install `web-vitals` v4+ (`npm i web-vitals`); import from the attribution build (`web-vitals/attribution`) to capture `attribution` objects for LCP, INP, and CLS
  - [ ] 1.2 Create `lib/rum.ts` exporting `sendRumPayload(payload: RumPayload): void` — serialise `payload` to JSON and call `navigator.sendBeacon(process.env.NEXT_PUBLIC_RUM_ENDPOINT, data)` in a `try/catch`; log `console.warn('RUM send failed:', metric.name)` on error in non-production environments only
  - [ ] 1.3 Add `inferDeviceCategory(): 'mobile' | 'tablet' | 'desktop'` helper in `lib/rum.ts` based on `navigator.userAgent` and `window.innerWidth`
  - [ ] 1.4 Create `app/_components/RumProvider.tsx` (`'use client'`); in `useEffect`, register `onLCP`, `onINP`, `onCLS`, `onFCP`, `onTTFB` handlers that call `sendRumPayload({ name, value, rating, navigationType, url, deviceCategory, attribution })`; when `rating === 'poor'` call `sendRumPayload` a second time with `{ event: 'cwv_poor', metric: name, value, url }`
  - [ ] 1.5 Add `<RumProvider />` as the last child of `app/layout.tsx` so it does not delay the initial render
  - [ ] 1.6 Add `NEXT_PUBLIC_RUM_ENDPOINT` to `.env.example` with a placeholder value and document it in the project README
  - [ ] 1.7 Write Vitest unit tests for `sendRumPayload`: `sendBeacon` called with correct URL and JSON; `console.warn` fired when `sendBeacon` unavailable; additional `cwv_poor` payload fired when `rating === 'poor'`
  - _Requirements: R6.1, R6.2, R6.3, R6.6_

- [ ] 2. Establish synthetic baseline (Lighthouse CI)
  - [ ] 2.1 Install `@lhci/cli` as a dev dependency (`npm i -D @lhci/cli`)
  - [ ] 2.2 Create `.lighthouserc.json` with `collect.url` listing home page, a dynamic page, and a content-heavy page; set `collect.numberOfRuns: 3`; set `assert.assertions` for `largest-contentful-paint`, `cumulative-layout-shift`, `total-blocking-time`, `server-response-time` with initial thresholds set to the current (pre-optimisation) measured values so the gate passes on the baseline commit
  - [ ] 2.3 Create `.github/workflows/lighthouse.yml` with steps: checkout, setup Node 20, `npm ci`, `next build`, `next start &`, `wait-on http://localhost:3000`, `npx lhci autorun`, upload `.lighthouseci/` as artifact; add `needs: [build]` dependency
  - [ ] 2.4 Run Lighthouse CI locally (`npx lhci autorun`) and record baseline LCP, CLS, TBT, and TTFB values; document them in a code comment at the top of `.lighthouserc.json`
  - [ ] 2.5 After baseline is recorded, tighten `.lighthouserc.json` assertions to final targets: `largest-contentful-paint` ≤ 2 500 ms, `cumulative-layout-shift` ≤ 0.1, `total-blocking-time` ≤ 200 ms, `server-response-time` ≤ 800 ms
  - _Requirements: R1.6, R2.6, R3.5, R5.5, R6.4, R6.5_

- [ ] 3. Optimise LCP image and critical resources
  - [ ] 3.1 Create `scripts/convert-images.mjs` using `sharp`; walk `public/images/`; for each JPEG/PNG write an AVIF sibling at quality 80 and a WebP sibling at quality 85; log original size, AVIF size, and savings percentage; skip files that already have AVIF siblings
  - [ ] 3.2 Run `node scripts/convert-images.mjs` and commit the generated AVIF/WebP files; verify AVIF size is ≤ 60 % of original JPEG for each image
  - [ ] 3.3 Update `next.config.js` to add `images: { formats: ['image/avif', 'image/webp'] }` so Next.js Image Optimizer negotiates AVIF first, then WebP
  - [ ] 3.4 Identify the LCP element on each audited page (from Lighthouse report or RUM attribution); ensure the corresponding `<Image>` component has `priority={true}`; confirm a `<link rel="preload" fetchpriority="high" as="image">` tag appears in the rendered `<head>`
  - [ ] 3.5 Audit all third-party `<Script>` tags in `app/layout.tsx`; move any that are not required above the fold from `strategy="beforeInteractive"` to `strategy="afterInteractive"` or `strategy="lazyOnload"`; document the reason for each choice in a comment
  - [ ] 3.6 Confirm critical CSS is inlined: inspect the rendered HTML of the home page and verify no render-blocking `<link rel="stylesheet">` appears before `</head>`; if a third-party stylesheet is render-blocking, convert it to use the `media="print" onload="this.media='all'"` deferred-load pattern
  - [ ] 3.7* Run Lighthouse with CPU throttling disabled (to isolate network effects from JS execution effects) and compare LCP before/after to confirm the improvement is image/network driven
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6_

- [ ] 4. Eliminate font-based CLS and optimise font loading
  - [ ] 4.1 Migrate all `@font-face` declarations to `next/font` (either `next/font/google` for Google Fonts or `next/font/local` for self-hosted files); set `display: 'swap'` and `adjustFontFallback: true` on each font configuration
  - [ ] 4.2 Verify Next.js generates `size-adjust` and `ascent-override` CSS for the fallback font by inspecting the rendered `<style>` tag in the `<head>`; confirm the fallback font metrics match the web font metrics by comparing the page at 0 ms (fallback) and 200 ms (loaded) with no visible text reflow
  - [ ] 4.3 For any font file not handled by `next/font`, add a manual `<link rel="preload" as="font" crossorigin href="/fonts/[filename].woff2" type="font/woff2">` in `app/layout.tsx` so the font fetch begins during HTML parse
  - [ ] 4.4 Run Lighthouse and confirm `font-display` audit passes and CLS score decreases relative to baseline
  - _Requirements: R3.2, R3.6, R1.4_

- [ ] 5. Fix image and media CLS
  - [ ] 5.1 Audit all `<img>`, `<Image>`, `<video>`, and `<iframe>` elements in the codebase: any element missing explicit `width` and `height` (or an `aspect-ratio` CSS property) must be updated; use `grep -rn "<img " app/ components/` to locate candidates
  - [ ] 5.2 For `<Image fill>` usage, wrap the element in a `<div style={{ position: 'relative', aspectRatio: '16/9' }}>` (or the correct aspect ratio) so the container reserves space before the image loads
  - [ ] 5.3 Audit late-injected content: identify any component that injects content into the document flow after the initial render (cookie banner, notification toasts, interstitials); move them to `position: fixed` or `position: absolute` so they do not shift inline content
  - [ ] 5.4 Audit CSS animations: search for `transition:` or `animation:` rules that include `height`, `top`, `left`, `margin`, `padding`, or `width`; refactor each to use `transform: translateY()` / `opacity` exclusively; document the refactoring reason in a comment above each rule
  - [ ] 5.5 Run Lighthouse and confirm CLS < 0.1; run `next build && next start` locally and use Chrome DevTools Layout Shift Regions (Rendering tab) to visually confirm no shifts on page load
  - _Requirements: R3.1, R3.3, R3.4, R3.5, R3.6_

- [ ] 6. Reduce INP — yield, transitions, virtualisation
  - [ ] 6.1 Create `lib/scheduler.ts` exporting `yieldToMain(): Promise<void>` — `return 'scheduler' in globalThis && typeof scheduler.yield === 'function' ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0))`
  - [ ] 6.2 Use Chrome DevTools Performance panel (or the RUM INP attribution data from Task 1) to identify all event handlers with > 50 ms synchronous execution time; for each identified handler, insert `await yieldToMain()` calls after each ≤ 50 ms work chunk
  - [ ] 6.3 Identify all `setState` calls triggered by user events that cause expensive re-renders (filtering, sorting, searching); wrap each with `React.startTransition(() => setState(...))` and verify that the immediate UI feedback (e.g., a checkbox visually checking) does NOT use `startTransition` — only the deferred re-render does
  - [ ] 6.4 Identify all lists rendered with more than 100 items; install `@tanstack/react-virtual` (`npm i @tanstack/react-virtual`) and refactor each list to use `useVirtualizer` with an overscan of 5; confirm the DOM node count for the list is bounded regardless of data size
  - [ ] 6.5 Identify all heavy Client Components (chart libraries, rich text editors, data grids, PDF renderers); for each, replace the static import with `const HeavyWidget = dynamic(() => import('./HeavyWidget'), { ssr: false, loading: () => <Skeleton /> })`; verify in Chrome DevTools Network tab that the chunk is fetched on demand, not in the initial page load
  - [ ] 6.6 Write Vitest unit test for `yieldToMain`: when `scheduler.yield` is available (mocked), it is called; when absent, resolves after a `setTimeout(0)` tick
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6_

- [ ] 7. Reduce JavaScript bundle size
  - [ ] 7.1 Install `@next/bundle-analyzer` (`npm i -D @next/bundle-analyzer`); add `ANALYZE=true next build` script to `package.json` and wrap `next.config.js` with `withBundleAnalyzer`
  - [ ] 7.2 Run `npm run build:analyze`; open the generated HTML report; identify any dependency that is unexpectedly included in the shared `_app` chunk or in a route that does not use it
  - [ ] 7.3 For each heavy dependency used on a single route (identified in 7.2), convert to named/subpath imports (e.g., `import { format } from 'date-fns'` instead of `import * as dateFns from 'date-fns'`); re-run the analyzer and confirm the chunk size decreases
  - [ ] 7.4 Create `scripts/check-bundle-size.js` (Node.js, CJS): read `.next/build-manifest.json`; for each route, resolve the JS files listed, read their sizes, compute estimated gzip size using `zlib.gzipSync`; log a table with route, total KB, and status (PASS / FAIL); exit with code 1 if any route exceeds `BUNDLE_LIMIT_KB` (default 150, overridable via env var)
  - [ ] 7.5 Add `package.json` `"sideEffects": false` (or a specific list of CSS files and polyfills that have side effects) to enable tree-shaking of unused project-level exports
  - [ ] 7.6 Configure `swc` in `next.config.js` to remove `console.log` statements in production: `compiler: { removeConsole: { exclude: ['error', 'warn'] } }` (keep `error` and `warn` for debugging)
  - [ ] 7.7 Add `node scripts/check-bundle-size.js` as a step in `.github/workflows/ci.yml` after the `next build` step; confirm it exits 1 on a test route that exceeds the limit and passes on a compliant route
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [ ] 8. Optimise CDN delivery and TTFB
  - [ ] 8.1 Audit every page in `app/` for rendering mode: tag each as static (no per-request data), ISR (revalidates on interval), or dynamic (per-request); for static pages add `export const dynamic = 'force-static'` or `generateStaticParams` where applicable
  - [ ] 8.2 For ISR pages, set appropriate `revalidate` values based on content update frequency (e.g., `export const revalidate = 3600` for blog posts, `60` for dashboard-adjacent pages) and verify stale-while-revalidate headers in the response: `Cache-Control: s-maxage=N, stale-while-revalidate=M`
  - [ ] 8.3 Add `async headers()` to `next.config.js` returning `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/**`; `no-store` for API routes that must not be cached; `s-maxage=60, stale-while-revalidate=300` for dynamic HTML pages
  - [ ] 8.4 Verify `compress: true` is set in `next.config.js`; make an HTTP request to the running server and confirm the `Content-Encoding: br` (Brotli) or `Content-Encoding: gzip` response header is present for JS and HTML responses
  - [ ] 8.5 For all Server Component `fetch` calls that query external APIs, add `{ next: { revalidate: N } }` or `{ cache: 'force-cache' }` options; verify in the Lighthouse CI report that `server-response-time` is < 800 ms
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5_

- [ ] 9. End-to-end verification
  - [ ] 9.1 Run full Lighthouse CI suite locally (`npx lhci autorun`) against a production build; confirm LCP < 2 500 ms, CLS < 0.1, TBT < 200 ms, and TTFB < 800 ms for all audited URLs; compare to baseline values recorded in Task 2.4
  - [ ] 9.2 Run `node scripts/check-bundle-size.js` against the production build; confirm all routes pass the 150 KB gzip limit; document any routes that required dynamic imports to comply
  - [ ] 9.3 Open the application in Chrome DevTools with the Performance panel; record a page load and an interaction (button click, list filter) on each audited page; confirm no Long Tasks > 50 ms in the interaction handler traces
  - [ ] 9.4 Inspect Chrome DevTools Application → Cache Storage and Network tab to confirm AVIF images are being served (check `Content-Type: image/avif` in response headers)
  - [ ] 9.5 Deploy to a staging environment and verify RUM events are flowing: check the RUM endpoint receives `page_view` and CWV payloads with correct `name`, `value`, `rating`, and `attribution` fields
  - [ ] 9.6 After 48 hours of RUM data in staging, query the endpoint for p75 LCP, INP, and CLS; confirm all metrics are in the "Good" band for the audited pages
  - _Requirements: R1.6, R2.6, R3.5, R5.5, R6.1, R6.2, R6.3, R6.4_

- [ ] 10. Update documentation
  - [ ] 10.1 Create or update `docs/performance.md` (or add a `## Performance` section to the project README) covering: CWV targets with thresholds table, how to run Lighthouse CI locally (`npx lhci autorun`), how to run the bundle size check (`node scripts/check-bundle-size.js`), how to add a new image (must use `scripts/convert-images.mjs` + `next/image`), how to diagnose an INP regression (RUM attribution → Chrome DevTools Performance panel → `yieldToMain` insertion), and how to interpret the Lighthouse CI PR comment
  - [ ] 10.2 Add JSDoc comments to `lib/rum.ts`, `lib/scheduler.ts`, and `scripts/check-bundle-size.js` explaining the rationale for each design decision (why `sendBeacon` over `fetch`, why `scheduler.yield()` polyfill, what the 150 KB limit is based on)
  - [ ] 10.3 Update `.env.example` with all new environment variables: `NEXT_PUBLIC_RUM_ENDPOINT`, `BUNDLE_LIMIT_KB`
  - _Requirements: R1.6, R2.6, R3.5, R4.6, R6.4_

# Implementation Plan: Marketing Landing Page

## Overview

This plan delivers the marketing landing page in strict dependency order: static content and types first, then the server-rendered page shell and metadata, then interactive Client Components, then analytics wiring, and finally a complete test suite. Every increment is self-contained and can be committed independently. Tasks marked `*` are optional nice-to-haves that can be deferred without blocking later work.

## Tasks

- [ ] 1. Define content types and static copy constants
  - [ ] 1.1 Create `lib/content/landing.ts` with exported TypeScript interfaces: `HeroContent`, `CtaLink`, `FeatureItem`, `Testimonial`, `CompanyLogo`, `ConversionEvent`
  - [ ] 1.2 Author the `HERO` constant with real headline (≤ 70 chars), subheadline, `primaryCta`, optional `secondaryCta`, and `image` metadata (src, alt, width, height)
  - [ ] 1.3 Author the `FEATURES` array (3–6 items) with `id`, `heading`, `description`, optional image, and `imagePosition`
  - [ ] 1.4 Author the `TESTIMONIALS` array (≥ 3 items) with quote, `authorName`, `authorRole`, `authorCompany`, `avatarSrc`, `avatarAlt`
  - [ ] 1.5 Author the `LOGOS` array (≥ 5 items) with `name`, `src` (SVG path under `public/`), `width`, `height`
  - [ ] 1.6 Write Vitest unit tests asserting that each constant satisfies its interface (no undefined required fields, `avatarAlt === authorName`, `imagePosition` is `'left' | 'right'`)
  - _Requirements: R1.1, R2.2, R3.1, R3.2_

- [ ] 2. Implement analytics helper
  - [ ] 2.1 Create `lib/analytics.ts` exporting `trackEvent(name: string, params: ConversionEvent): void`
  - [ ] 2.2 Inside `trackEvent`: check `window.__analyticsConsent`; if false, log `console.debug('Analytics suppressed: no consent')` and return
  - [ ] 2.3 If `typeof window.gtag === 'function'` call `window.gtag('event', name, params)`; otherwise push `{ name, params, ts: Date.now() }` to a `localStorage` queue (key: `'analytics_queue'`) for deferred dispatch
  - [ ] 2.4 Export `flushAnalyticsQueue(): void` that replays queued events once `gtag` is available; call it from `AnalyticsProvider` after the GA4 script loads
  - [ ] 2.5 Write Vitest unit tests: consent false → no gtag call; gtag present → gtag called with correct args; gtag absent → event queued in localStorage; `flushAnalyticsQueue` calls gtag for each queued event and clears the queue
  - _Requirements: R5.5, R5.6_

- [ ] 3. Set up route group layout and metadata skeleton
  - [ ] 3.1 Create `app/(marketing)/layout.tsx` (Server Component) rendering `<SiteHeader>` (nav + primary CTA link), `<main id="main-content">`, `<SiteFooter>`, and a `<Script src="https://www.googletagmanager.com/gtag/js?id=NEXT_PUBLIC_GA_MEASUREMENT_ID" strategy="afterInteractive">` tag
  - [ ] 3.2 Create `app/(marketing)/page.tsx` and implement `generateMetadata()` returning: `title` (≤ 60 chars), `description` (120–160 chars), `openGraph` (`og:title`, `og:description`, `og:image`, `og:type`, `og:url`), `twitter` card, and `robots`; fall back to `'https://example.com'` if `NEXT_PUBLIC_SITE_URL` is absent
  - [ ] 3.3 Add `SkipLink` as the first child of `layout.tsx`: `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 bg-white text-black p-2">Skip to main content</a>`
  - [ ] 3.4 Verify that `next build` produces a static (or ISR) render of the route with all metadata tags present in the HTML output
  - _Requirements: R6.1, R6.2, R6.3, R7.4_

- [ ] 4. Build Hero section (Server Component)
  - [ ] 4.1 Create `app/(marketing)/_components/Hero.tsx` accepting `content: HeroContent`; render `<section aria-labelledby="hero-headline">`, `<h1 id="hero-headline">`, subheadline `<p>`, one or two `<CtaButton>` components, and `<Image src priority={true} width height alt>`
  - [ ] 4.2 Create `app/(marketing)/_components/CtaButton.tsx` (`'use client'`); on click, call `trackEvent('cta_click', { label, section, destination })` then follow the `href` via `window.location.assign` or `router.push`; apply minimum touch target (`min-h-[44px] min-w-[44px]`); ensure `aria-label` falls back to visible text if provided separately
  - [ ] 4.3 Confirm the hero image has explicit `width` and `height` in `HeroContent` so Next.js never infers dimensions at runtime (CLS = 0 for hero image)
  - [ ] 4.4 Add `next.config.js` `images.remotePatterns` entry for the hero image domain (if external); otherwise ensure image is under `public/` as a local asset
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6_

- [ ] 5. Build Feature sections (Server + Client Components)
  - [ ] 5.1 Create `app/(marketing)/_components/FeatureSection.tsx` (Server Component) accepting `feature: FeatureItem` and `index: number`; render `<section id={feature.id} aria-labelledby={...}>` with alternating flex-row / flex-row-reverse based on `imagePosition`; heading is `<h2>`; image uses `<Image loading="lazy" width height alt>`
  - [ ] 5.2 Create `app/(marketing)/_components/ScrollAnimationWrapper.tsx` (`'use client'`); attach `IntersectionObserver` in `useEffect`; add CSS class `is-visible` when element enters viewport; define `@keyframes fadeUp` in `globals.css`; check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip observer attachment if true, rendering children immediately visible
  - [ ] 5.3 Create `app/(marketing)/_components/FeatureGrid.tsx` (Server Component) mapping `FEATURES` to `<ScrollAnimationWrapper key={f.id}><FeatureSection feature={f} index={i} /></ScrollAnimationWrapper>`
  - [ ] 5.4 Write RTL unit test for `<FeatureSection>`: heading renders as `<h2>`, image has correct `alt`, section has correct `id`; test for both `imagePosition` values
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5_

- [ ] 6. Build Social Proof section
  - [ ] 6.1 Create `app/(marketing)/_components/LogoStrip.tsx` (Server Component); render `LOGOS.map(l => <img src={l.src} alt={l.name} width={l.width} height={l.height} style={{ filter: 'grayscale(1)' }} />)` in a flex row with `gap-8 flex-wrap`
  - [ ] 6.2 Create `app/(marketing)/_components/TestimonialCard.tsx` (Server Component); render `<blockquote>`, `<cite>` with author name, role, company, and `<img src={avatarSrc} alt={avatarAlt} width={48} height={48} className="rounded-full">`
  - [ ] 6.3 Create `app/(marketing)/_components/TestimonialCarousel.tsx` (`'use client'`); `useState<number>(0)` for active index; render `<div role="region" aria-label="Customer testimonials">`; render active `<TestimonialCard>`; Previous/Next `<button>` with `aria-label`; `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` announcing "Testimonial {n} of {total}"
  - [ ] 6.4 Create `app/(marketing)/_components/SocialProof.tsx` (Server Component) composing `<LogoStrip>` and `<TestimonialCarousel testimonials={TESTIMONIALS}>`; render heading `<h2>Trusted by teams at...</h2>`
  - [ ] 6.5* Add JSON-LD `Review` structured data inside `<StructuredData>` for the first testimonial (or `AggregateRating` if a numeric score is present in `TESTIMONIALS`)
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 7. Build Lead Capture Form
  - [ ] 7.1 Create `app/(marketing)/_components/LeadForm.tsx` (`'use client'`); type `status: 'idle' | 'submitting' | 'success' | 'error'` via `useState`; render `<form>` with `<label htmlFor="email-input">Work email</label>`, `<input id="email-input" type="email" autoComplete="email" required>`, submit `<button>`, and privacy disclaimer `<p>` linking to `/privacy`
  - [ ] 7.2 On submit: call `e.preventDefault()`, set `status = 'submitting'`, `POST` to `process.env.NEXT_PUBLIC_LEAD_FORM_ENDPOINT` with `{ email, source: 'landing_page' }`, on 200 set `status = 'success'` and call `trackEvent('lead_form_submit', { label: 'landing_page' })`, on error set `status = 'error'`
  - [ ] 7.3 In error state: render "Something went wrong. Please try again." in a `<p role="alert">` and re-enable the submit button; retain the email `<input>` value
  - [ ] 7.4 In success state: replace form with `<p role="status">You're on the list — check your inbox.</p>`
  - [ ] 7.5 Guard against missing `NEXT_PUBLIC_LEAD_FORM_ENDPOINT`: if undefined, log `console.error` in development and render the form disabled with `aria-disabled="true"` and message "Lead form unavailable"
  - [ ] 7.6 Associate error messages with the input via `aria-describedby="email-error"`; set `aria-invalid="true"` on the input when `status === 'error'`
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [ ] 8. Implement Analytics Provider and structured data
  - [ ] 8.1 Create `app/(marketing)/_components/AnalyticsProvider.tsx` (`'use client'`); in `useEffect` parse `window.location.search` for UTM params, call `trackEvent('page_view', { path: '/landing', referrer: document.referrer, utm_source, utm_medium, utm_campaign })`; call `flushAnalyticsQueue()`
  - [ ] 8.2 In `AnalyticsProvider`, create four `<div>` sentinel elements placed at 25%, 50%, 75%, 90% of `document.body.scrollHeight` using absolute positioning; attach an `IntersectionObserver` and fire `trackEvent('scroll_depth', { depth })` exactly once per threshold using a `firedDepths = useRef(new Set<number>())` guard
  - [ ] 8.3 Create `app/(marketing)/_components/StructuredData.tsx` (Server Component) rendering `<script type="application/ld+json">` with `Organization` schema: `name`, `url`, `logo`, `sameAs` sourced from environment variables `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_SOCIAL_URLS` (comma-separated)
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R6.4_

- [ ] 9. Accessibility audit and polish
  - [ ] 9.1 Run `@axe-core/react` in development mode on the full page; resolve all violations before proceeding
  - [ ] 9.2 Verify heading hierarchy: exactly one `<h1>` in `<Hero>`, all feature and section headings are `<h2>`, no skipped levels
  - [ ] 9.3 Verify all `<img>` and `<Image>` elements: non-empty `alt` for meaningful images, `alt=""` and `aria-hidden="true"` for decorative SVGs
  - [ ] 9.4 Verify `<CtaButton>` focus ring is visible on all backgrounds; check contrast ratio of ring color against adjacent background colors (target ≥ 3:1 per WCAG 1.4.11)
  - [ ] 9.5* Run keyboard-only walkthrough manually in Chrome: Tab order follows DOM order, all interactive elements reachable, skip link appears on first Tab press, carousel Prev/Next operable via Enter
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

- [ ] 10. End-to-end verification
  - [ ] 10.1 Run `next build && next start` locally; navigate to `http://localhost:3000/` and confirm all sections render correctly at 375 px, 768 px, and 1 280 px viewports in Chrome DevTools
  - [ ] 10.2 Run `npx lighthouse http://localhost:3000/ --form-factor=mobile --throttling-method=simulate` and confirm LCP < 2 500 ms, CLS < 0.1, INP < 200 ms, Performance score ≥ 90
  - [ ] 10.3 Inspect page source (`view-source:`) and confirm `<title>`, `<meta name="description">`, `<meta property="og:image">`, and `<script type="application/ld+json">` are present in the initial HTML
  - [ ] 10.4 Run Playwright E2E suite: happy-path CTA click, lead form success, lead form error, axe scan, LCP/CLS assertion
  - [ ] 10.5 Submit the lead form with a test email; confirm the POST reaches the marketing automation endpoint (check endpoint logs or MSW server mode)
  - _Requirements: R1.2, R5.1, R6.1, R6.2, R6.4, R7.2_

- [ ] 11. Update documentation
  - [ ] 11.1 Update `README.md` (or `docs/landing-page.md` if it exists) with: environment variables required (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_LEAD_FORM_ENDPOINT`, `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_SOCIAL_URLS`), how to update page copy (edit `lib/content/landing.ts`), and how to run Lighthouse locally
  - [ ] 11.2 Add a `# Landing Page` section to the project's `CONTRIBUTING.md` (or equivalent) describing the Server/Client Component split and the analytics consent contract
  - _Requirements: R1.1, R5.5, R6.1_

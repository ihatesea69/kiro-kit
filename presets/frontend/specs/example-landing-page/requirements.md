# Requirements Document

## Introduction

The Marketing Landing Page is a high-converting, publicly accessible page built with Next.js App Router and React Server Components. It serves as the primary acquisition surface for the product, communicating the value proposition through a hero section, feature highlights, and social proof, while tracking visitor behaviour via analytics events. The page must achieve excellent Core Web Vitals scores — in particular a fast Largest Contentful Paint — so that organic search ranking and ad Quality Scores are not penalised.

## Glossary

- **Hero Section**: The above-the-fold area containing the primary headline, subheadline, and one or more Call-to-Action buttons.
- **CTA**: Call-to-Action — a button or link designed to drive a specific user action (e.g., "Start free trial", "Book a demo").
- **Feature Section**: A content block highlighting a single product capability with a heading, description, and optional illustration or screenshot.
- **Social Proof**: Evidence of third-party endorsement — customer testimonials with name/avatar/role, company logo strips, or aggregate review scores.
- **Conversion Event**: An analytics event fired when a user performs a meaningful action (e.g., clicks a primary CTA, scrolls past 50%, submits the lead form).
- **LCP**: Largest Contentful Paint — Core Web Vitals metric targeting < 2.5 s; the largest visible image or text block must paint quickly.
- **CLS**: Cumulative Layout Shift — Core Web Vitals metric targeting < 0.1; content must not shift unexpectedly after initial paint.
- **INP**: Interaction to Next Paint — Core Web Vitals metric targeting < 200 ms; button clicks and form interactions must respond quickly.
- **OpenGraph**: A protocol for controlling how pages are represented when shared on social networks (title, description, image).
- **Structured Data**: JSON-LD markup understood by search engines to produce rich results (e.g., Organization, WebPage schema).
- **Lead Form**: An inline email-capture form allowing visitors to express interest without leaving the page.
- **WCAG 2.1 AA**: Web Content Accessibility Guidelines 2.1 at conformance level AA — the accessibility standard this page must meet.

## Out of Scope

- Authenticated user flows (login, dashboard, settings) — handled by separate application routes.
- E-commerce checkout or payment processing.
- A/B testing infrastructure or multi-variant experiments — this spec covers the canonical variant only.
- Internationalisation (i18n) and localisation beyond English.
- Blog, documentation, or legal pages (Privacy Policy, Terms of Service).
- Server-side lead-form submission handling or CRM integration — the form POSTs to an external marketing automation endpoint.
- Dark-mode theming (planned for a later iteration).

## Requirements

### Requirement 1: Hero Section with Primary CTA

**User Story:** As a potential customer visiting the site for the first time, I want to immediately understand what the product does and have a clear action to take, so that I can decide within seconds whether to explore further or sign up.

#### Acceptance Criteria

1. WHEN the page is loaded THE SYSTEM SHALL render the hero section above the fold on all viewport widths (320 px–2 560 px) with a primary headline (H1), a subheadline (H2 or `<p>`), a primary CTA button, and an optional secondary CTA link.
2. WHEN the hero section is rendered THE SYSTEM SHALL display a hero image or product screenshot using `next/image` with `priority={true}` and explicit `width` and `height` attributes so that the element is eligible to be the LCP element and no layout shift occurs on load.
3. WHEN the primary CTA button is clicked THE SYSTEM SHALL fire a `conversion_event` analytics event with `{ action: 'cta_click', label: 'hero_primary', destination: '<href>' }` before navigating.
4. WHERE the hero image is rendered THE SYSTEM SHALL serve it in AVIF format with a WebP fallback via the Next.js Image Optimizer, and the image must be hosted on an allowed `next.config.js` image domain or served as a local static asset.
5. IF the visitor's browser does not execute JavaScript THE SYSTEM SHALL still render the hero headline, subheadline, and CTA links as static HTML so the page is usable and indexable.
6. WHERE the primary CTA button is rendered THE SYSTEM SHALL ensure it meets a minimum touch target size of 44 × 44 CSS pixels and has an accessible name that matches its visible label (WCAG 2.5.3).

### Requirement 2: Feature Sections

**User Story:** As a potential customer evaluating the product, I want to read about specific capabilities in digestible sections, so that I can understand how each feature addresses my pain points.

#### Acceptance Criteria

1. WHEN the page is rendered THE SYSTEM SHALL display between three and six feature sections in a single-column layout on mobile (< 768 px) and in alternating two-column image-left / image-right layouts on tablet and desktop (≥ 768 px).
2. WHEN a feature section is rendered THE SYSTEM SHALL include a feature heading (H3 or H2 within the section), a description paragraph of 20–80 words, and an optional feature icon or illustration loaded via `next/image` with `loading="lazy"`.
3. WHERE feature section images are rendered THE SYSTEM SHALL set explicit `width` and `height` (or use `fill` with a fixed-aspect container) so that CLS contribution from below-fold images is zero.
4. WHEN the user scrolls a feature section into the viewport for the first time THE SYSTEM SHALL apply a CSS `@keyframes` fade-in animation using the Intersection Observer API, triggered via a `'use client'` wrapper component, with `prefers-reduced-motion` respected (animation skipped when enabled).
5. IF the `prefers-reduced-motion` CSS media query is active THE SYSTEM SHALL suppress all scroll-triggered animations and present all sections as immediately visible.

### Requirement 3: Social Proof Section

**User Story:** As a potential customer uncertain about committing to the product, I want to see real endorsements from other users and recognisable company logos, so that I can trust that the product delivers on its promises.

#### Acceptance Criteria

1. WHEN the social proof section is rendered THE SYSTEM SHALL display a testimonial carousel or grid containing at least three testimonials, each with: a visible quote (30–120 words), the reviewer's full name, their role and company, and a `<img>` avatar with non-empty `alt` equal to the reviewer's name.
2. WHEN the social proof section is rendered THE SYSTEM SHALL display a logo strip of at least five customer company logos, each rendered as an `<img>` with an `alt` attribute equal to the company name.
3. WHERE company logo images are used THE SYSTEM SHALL serve them as SVG files (inline or via `<img>`) with explicit width and height attributes and filter the color to a neutral greyscale using CSS `filter: grayscale(1)` to maintain visual consistency.
4. IF a testimonial carousel is used THE SYSTEM SHALL provide Previous/Next controls with `aria-label="Previous testimonial"` and `aria-label="Next testimonial"`, and an `aria-live="polite"` region announcing the currently visible testimonial index (e.g., "Testimonial 2 of 5").
5. WHEN the social proof section is rendered THE SYSTEM SHALL include `application/ld+json` structured data of type `Review` or `AggregateRating` (if an aggregate score is shown) to support Google rich results.

### Requirement 4: Lead Capture Form

**User Story:** As a potential customer not yet ready to start a free trial, I want to leave my email address to receive more information, so that I can re-engage with the product at a later time when I am ready.

#### Acceptance Criteria

1. WHEN the lead form section is rendered THE SYSTEM SHALL display a single-field email input with a visible `<label>` ("Work email"), a submit button ("Get early access"), and a one-sentence privacy disclaimer linking to `/privacy`.
2. WHEN the user submits the form with a valid email address THE SYSTEM SHALL disable the submit button during submission, POST `{ email, source: 'landing_page' }` to the marketing automation endpoint (`NEXT_PUBLIC_LEAD_FORM_ENDPOINT`), and on success replace the form with a confirmation message ("You're on the list — check your inbox.").
3. IF the submitted email address fails HTML5 email-format validation THE SYSTEM SHALL display the browser's native validation message and prevent submission, without requiring a round trip to the server.
4. IF the POST request to the lead form endpoint fails with a network error or HTTP 4xx/5xx THE SYSTEM SHALL display an inline error message ("Something went wrong. Please try again."), re-enable the submit button, and retain the entered email value so the user can retry.
5. WHEN the form is successfully submitted THE SYSTEM SHALL fire a `conversion_event` analytics event with `{ action: 'lead_form_submit', label: 'landing_page' }`.
6. WHERE the email input is rendered THE SYSTEM SHALL associate it with its label via `htmlFor`/`id`, set `type="email"`, `autocomplete="email"`, and `required` attributes, and ensure the field is reachable and operable via keyboard alone (WCAG 1.3.1, 1.3.5).

### Requirement 5: Conversion Tracking and Analytics

**User Story:** As a marketing manager, I want key user interactions on the landing page to be tracked as analytics events, so that I can measure conversion rates and optimise the page over time.

#### Acceptance Criteria

1. WHEN the page is first rendered in the browser THE SYSTEM SHALL fire a `page_view` analytics event containing `{ path: '/landing', referrer: document.referrer, utm_source, utm_medium, utm_campaign }` parsed from `window.location.search`.
2. WHEN a visitor scrolls past the 25%, 50%, 75%, and 90% scroll-depth thresholds THE SYSTEM SHALL fire a `scroll_depth` analytics event with `{ depth: 25 | 50 | 75 | 90 }` exactly once per threshold per page session.
3. WHEN the user clicks any CTA button on the page THE SYSTEM SHALL fire a `cta_click` analytics event with `{ label: '<button-label>', section: '<section-id>', destination: '<href>' }`.
4. WHEN the lead form is submitted successfully THE SYSTEM SHALL fire a `lead_form_submit` event as specified in Requirement 4.5.
5. WHERE analytics events are fired THE SYSTEM SHALL call `window.gtag('event', eventName, eventParams)` if the `gtag` global is present, and also call a `trackEvent(name, params)` helper from `lib/analytics.ts` that queues events in localStorage when `gtag` is not yet loaded (e.g., before the GA4 script tag fires).
6. IF the user has not consented to analytics cookies THE SYSTEM SHALL suppress all `gtag` calls and log a `console.debug` message; the `trackEvent` helper must check `window.__analyticsConsent` before firing.

### Requirement 6: SEO and OpenGraph Metadata

**User Story:** As a marketing manager, I want the landing page to have correct SEO metadata and rich social-sharing cards, so that search engines rank it accurately and links shared on social networks display an engaging preview.

#### Acceptance Criteria

1. WHEN the page is server-rendered THE SYSTEM SHALL export a Next.js `generateMetadata` function from `app/(marketing)/page.tsx` that returns a `Metadata` object with: `title` (≤ 60 characters), `description` (120–160 characters), `robots: { index: true, follow: true }`, and `canonical` URL set to `https://<NEXT_PUBLIC_SITE_URL>/`.
2. WHEN the page is server-rendered THE SYSTEM SHALL include OpenGraph tags: `og:title`, `og:description`, `og:image` (1 200 × 630 px JPEG or PNG, < 300 KB), `og:type: 'website'`, and `og:url`.
3. WHEN the page is server-rendered THE SYSTEM SHALL include Twitter Card tags: `twitter:card: 'summary_large_image'`, `twitter:title`, `twitter:description`, and `twitter:image`.
4. WHEN the page is server-rendered THE SYSTEM SHALL include a `<script type="application/ld+json">` tag with an `Organization` schema containing `name`, `url`, `logo`, and `sameAs` (social profile URLs from environment variables).
5. WHERE the `<title>` element value is set THE SYSTEM SHALL ensure it is unique to this page and matches the H1 headline so that keyword consistency is maintained for SEO.

### Requirement 7: Responsive Layout and Accessibility

**User Story:** As a visitor using any device or assistive technology, I want the landing page to be readable and operable on any screen size and with a keyboard or screen reader, so that I am not excluded from accessing the product's marketing content.

#### Acceptance Criteria

1. WHERE the page is rendered THE SYSTEM SHALL use a mobile-first responsive layout: a single-column stack on viewports < 768 px, a two-column layout for feature sections on 768–1 023 px, and a wider two-column or three-column layout on ≥ 1 024 px.
2. WHEN the page is rendered at any viewport width THE SYSTEM SHALL pass the WCAG 2.1 AA automated audit (zero violations reported by `axe-core`) including: heading hierarchy (single H1, logical H2/H3 nesting), sufficient color contrast (≥ 4.5:1 for normal text, ≥ 3:1 for large text), and all images having non-empty `alt` text.
3. WHERE interactive elements (CTA buttons, form fields, testimonial carousel controls) are rendered THE SYSTEM SHALL ensure every element is reachable via Tab / Shift+Tab in DOM order and activatable via Enter or Space without a mouse.
4. WHEN a keyboard user reaches the page THE SYSTEM SHALL offer a visually hidden "Skip to main content" link as the first focusable element, visible on focus, that moves focus to `<main id="main-content">`.
5. WHEN color alone would distinguish interactive state (hover, focus, active) THE SYSTEM SHALL also use a visible focus ring (outline: 2 px solid with 2 px offset) or a non-color indicator such as underline or icon so the state is perceivable without color vision (WCAG 1.4.1).
6. WHERE the page contains images decorative in nature (background shapes, dividers) THE SYSTEM SHALL set `alt=""` and `aria-hidden="true"` on those elements so screen readers skip them.

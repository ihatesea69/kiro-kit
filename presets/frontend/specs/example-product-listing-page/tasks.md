# Implementation Plan: Product Listing Page

## Overview

This plan delivers the Product Listing Page in strict dependency order: data contracts first, then server rendering, then client interactivity, then accessibility polish, and finally a comprehensive test suite. Each top-level task is self-contained and produces a working, committable increment. Tasks marked with `*` contain optional (nice-to-have) sub-tasks that can be deferred without blocking later work.

## Tasks

- [ ] 1. Define TypeScript interfaces and URL utility functions
  - [ ] 1.1 Create `app/products/_lib/types.ts` with `Product`, `ProductPage`, `Category`, `ProductFilters` interfaces and `DEFAULT_FILTERS` constant as specified in the design data models
  - [ ] 1.2 Create `app/products/_lib/filters.ts` implementing `parseFilters(searchParams: URLSearchParams): ProductFilters` — coerce unknown `sort` values to `'relevance'`, non-numeric `page` to `1`, absent price params to `null`, absent `category` to `[]`
  - [ ] 1.3 Create `app/products/_lib/url.ts` implementing `buildUrl(override: Partial<ProductFilters>, current: URLSearchParams): string` — merge override with parsed current state, omit params equal to `DEFAULT_FILTERS`, serialize `category` as repeated params
  - [ ] 1.4 Write Vitest unit tests for `parseFilters`: all valid input combinations, unknown `sort` coercion, non-numeric `page` coercion, completely empty `searchParams`, partially populated params
  - [ ] 1.5 Write Vitest unit tests for `buildUrl`: default values omitted, `page=1` omitted, `sort=relevance` omitted, multi-value `category`, partial override merges with current params, empty filters produce `/products`
  - _Requirements: R3.3, R3.4, R4.4_

- [ ] 2. Implement API layer (Route Handlers and server-side fetch helpers)
  - [ ] 2.1 Create `app/api/products/route.ts` as a `GET` Route Handler that accepts `category` (repeatable), `min_price`, `max_price`, `sort`, `page` query params, validates them, and proxies the request to the backend catalog API, returning the `ProductPage` JSON response with `Cache-Control: no-store`
  - [ ] 2.2 Create `app/api/categories/route.ts` as a `GET` Route Handler returning `Category[]` with `export const revalidate = 3600` for stale-while-revalidate caching
  - [ ] 2.3 Create `app/products/_lib/api.ts` with `fetchProducts(filters: ProductFilters): Promise<ProductPage>` and `fetchCategories(): Promise<Category[]>` — use `fetch` with `{ cache: 'no-store' }` for products and `{ next: { revalidate: 3600 } }` for categories
  - [ ] 2.4 In `fetchProducts`, throw a typed `ApiError` on HTTP 5xx responses and call `notFound()` from `next/navigation` on HTTP 404 responses
  - [ ] 2.5 Create MSW request handlers in `src/mocks/handlers/products.ts` mocking `GET /api/products` and `GET /api/categories` with realistic fixture data for use in all integration tests
  - _Requirements: R1.2, R6.3, R6.5_

- [ ] 3. Build server-rendered page shell and product grid
  - [ ] 3.1 Create `app/products/page.tsx` as an `async` Server Component: accept `{ searchParams }` props, call `parseFilters`, call `fetchProducts` and `fetchCategories` in parallel via `Promise.all`, detect out-of-range `page` and issue `redirect` with corrected URL if `filters.page > productPage.totalPages`
  - [ ] 3.2 Wrap `<ProductGrid>` in `<Suspense fallback={<ProductGridSkeleton />}>` inside `page.tsx` to enable streaming — page shell renders before product data resolves (R1.4)
  - [ ] 3.3 Create `app/products/_components/ProductGrid.tsx` (Server Component) accepting `productPage: ProductPage`; render a `<ul id="product-grid">` with one `<li>` per product, using the responsive Tailwind grid classes: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`
  - [ ] 3.4 Create `app/products/_components/ProductCard.tsx` (Server Component) accepting `{ product, priority }` props; render an `<article>` containing a `next/image` with `alt={product.imageAlt}`, a `<a href={/products/${product.slug}}>` wrapping the product name, a formatted price string (`Intl.NumberFormat` with style `'currency'`), and a category badge `<span>`
  - [ ] 3.5 Pass `priority={index < 4}` from `ProductGrid` to the first four `ProductCard` instances to trigger LCP image preloading; all remaining cards use the default `loading="lazy"`
  - [ ] 3.6 Create `app/products/not-found.tsx` with a standard 404 message and a link back to `/products`
  - [ ] 3.7 Add an informational banner component in `page.tsx` triggered by a `redirected-from-page` search param set during out-of-range page redirect, displaying "Page N does not exist. Showing the last page."
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R4.5_

- [ ] 4. Build skeleton and loading states
  - [ ] 4.1 Create `app/products/_components/ProductCardSkeleton.tsx` as a pulsing `<div>` with `animate-pulse` Tailwind class; height and width must match a real `ProductCard` to prevent layout shift
  - [ ] 4.2 Create `app/products/_components/ProductGridSkeleton.tsx` rendering 12 `<ProductCardSkeleton>` instances in the same responsive grid layout used by `ProductGrid`
  - [ ] 4.3 Create `app/products/loading.tsx` that renders `<ProductGridSkeleton>` — Next.js automatically uses this as the Suspense fallback for the route during slow navigations
  - [ ] 4.4 Validate CLS score: run Lighthouse CI on the products route and assert `cumulative-layout-shift` audits score < 0.1
  - _Requirements: R6.1_

- [ ] 5. Build client-side filter panel
  - [ ] 5.1 Create `app/products/_components/FilterPanel.tsx` (`'use client'`); wrap content in `<nav aria-label="Product filters">`; accept `{ categories, initialFilters, priceRange }` props; expose `useTransition` to wrap all `router.push` calls so the previous grid stays visible during re-fetch
  - [ ] 5.2 Create `app/products/_components/CategoryFilter.tsx` (`'use client'`); render one native `<input type="checkbox">` per `Category` with a `<label>`; on change, call `router.push(buildUrl({ category: newSelection, page: 1 }, searchParams))`
  - [ ] 5.3 Create `app/products/_components/PriceRangeSlider.tsx` (`'use client'`); render two `<input type="range">` elements; set `aria-label="Minimum price"` on the left handle and `aria-label="Maximum price"` on the right; keep `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` attributes in sync with current values in cents; on `pointerUp`, call `onChange` with the updated `[min, max]` tuple
  - [ ] 5.4 In `FilterPanel`, set `aria-busy="true"` on the grid container element while `isPending` is `true` and render the semi-transparent loading overlay with a centered spinner (R2.6, R6.2)
  - [ ] 5.5 Create `app/products/_components/ActiveFilterBar.tsx` (`'use client'`); render a dismissible chip for each active category and price bound; each chip's close button calls `router.push(buildUrl({ ...remove param..., page: 1 }, searchParams))`; render a "Clear all filters" button that calls `router.push('/products')` (R2.5)
  - _Requirements: R2.1, R2.2, R2.3, R2.5, R2.6, R6.2_

- [ ] 6. Build sort control
  - [ ] 6.1 Create `app/products/_components/SortSelect.tsx` (`'use client'`); render a `<label htmlFor="sort-select">Sort by</label>` and a `<select id="sort-select">` with the four options: Relevance, Price: Low to High, Price: High to Low, Newest First
  - [ ] 6.2 On `<select>` change, call `router.push(buildUrl({ sort: newSort, page: 1 }, searchParams))` using `useTransition`
  - [ ] 6.3 Pre-select the option matching `currentSort` prop on render; if `currentSort` is undefined or invalid, pre-select "Relevance" and log `console.warn` with the invalid value (R3.3, R3.4)
  - _Requirements: R3.1, R3.2, R3.3, R3.4_

- [ ] 7. Build pagination control
  - [ ] 7.1 Create `app/products/_components/Pagination.tsx` (`'use client'`); wrap in `<nav aria-label="Pagination">`; accept `{ currentPage, totalPages, buildHref }` props
  - [ ] 7.2 Render page-number links as `<a href={buildHref(n)}>` elements (not `<button>`) so they are crawlable and functional without JavaScript (R5.6)
  - [ ] 7.3 Implement window logic: always show page 1, always show last page, show up to 5 pages centered on `currentPage`, and insert `<span aria-hidden="true">…</span>` ellipsis tokens for omitted ranges
  - [ ] 7.4 Add `aria-current="page"` to the `<a>` for `currentPage`; add `aria-disabled="true"` and `tabIndex={-1}` to "Previous" when `currentPage === 1` and to "Next" when `currentPage === totalPages` (R5.3, R5.4)
  - [ ] 7.5 On pagination link click, call `router.push(buildHref(n), { scroll: false })` then `document.getElementById('product-grid')?.scrollIntoView({ behavior: 'smooth' })` (R5.5)
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6_

- [ ] 8. Build empty and error states
  - [ ] 8.1 Create `app/products/_components/EmptyState.tsx` (Server Component); render "No products match your filters." heading, a "Clear all filters" `<a href="/products">` link, and up to 3 category suggestion links passed as props from the parent
  - [ ] 8.2 In `ProductGrid.tsx`, when `productPage.total === 0`, render `<EmptyState categories={topCategories} />` in place of the `<ul>` grid (R6.4)
  - [ ] 8.3 Create `app/products/_components/ErrorState.tsx` (`'use client'`); accept `{ onRetry, attemptCount }` props; render "Something went wrong loading products." and a "Try again" `<button>` calling `onRetry`; when `attemptCount >= 2`, append "(Attempt [attemptCount])" to the message (R6.6)
  - [ ] 8.4 Create `app/products/error.tsx` as a Client Component Error Boundary; maintain `attemptCount` state; render `<ErrorState onRetry={() => { router.refresh(); setAttemptCount(n + 1); }} attemptCount={attemptCount} />`
  - [ ] 8.5 Verify `app/products/not-found.tsx` is reachable: call `notFound()` in `fetchProducts` on HTTP 404 and confirm the not-found page renders in an integration test
  - _Requirements: R6.3, R6.4, R6.5, R6.6_

- [ ] 9. Wire URL-state synchronization end-to-end
  - [ ] 9.1 Audit all Client Components to confirm every `router.push` call uses `{ scroll: false }` and passes through `buildUrl` so canonical parameter omission is always applied (R4.4)
  - [ ] 9.2 Confirm `page.tsx` reads `searchParams` directly (not a client cache) so that any shared URL produces an identical server-rendered result in a fresh browser context (R4.2)
  - [ ] 9.3 Write integration test for browser Back/Forward: simulate `router.push` to add filter, then call `router.back()` and assert previous `searchParams` are restored (R4.3)
  - [ ] 9.4 Write Playwright E2E test: manually construct `/products?category=shoes&sort=price_asc&page=2`, open in a fresh browser context, assert that the rendered HTML contains products from the "shoes" category sorted by price ascending on page 2 (R4.2)
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [ ] 10. Add accessibility features and ARIA wiring
  - [ ] 10.1 Create `app/products/_components/LiveRegion.tsx` (`'use client'`); render a `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` and update its `message` prop to "Showing [N] products" after every transition completes
  - [ ] 10.2 Create a thin `ProductGridController` Client Component that wraps `<ProductGrid>` and uses a `useEffect` watching `isPending` from `useTransition`; when `isPending` transitions from `true` to `false`, call `.focus()` on the first `<a>` inside `#product-grid` (R7.2)
  - [ ] 10.3 Add a "Skip to product list" skip link as the first focusable element in the `app/products/layout.tsx` layout: `<a href="#product-grid" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50">Skip to product list</a>` (WCAG 2.4.1)
  - [ ] 10.4 Audit every `<ProductCard>`: confirm `alt={product.imageAlt}` is non-empty and that the `<a>` accessible name equals the product name (not the image alt or a generic label) (R7.4)
  - [ ] 10.5 Audit `<ActiveFilterBar>` and `<CategoryFilter>` to confirm active state is communicated by a checkmark icon or bold text label in addition to background colour (R7.5)
  - [ ] 10.6 Run `@axe-core/react` in development mode and verify zero violations in default, filtered, error, and empty states; add `axe-playwright` check to CI Playwright suite (R7.1, R7.6)
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

- [ ] 11. Write integration tests (RTL + MSW)
  - [ ] 11.1* Test: render with default MSW product fixture → check "Shoes" category → assert `router.push` called with `?category=shoes`, MSW re-intercepted with `category=shoes`, updated product names visible
  - [ ] 11.2* Test: change sort select to "Price: Low to High" → assert URL contains `sort=price_asc`, `page` param absent (reset to 1)
  - [ ] 11.3* Test: MSW returns 500 → `<ErrorState>` renders → click "Try again" → MSW returns 200 → `<ErrorState>` unmounts, product grid appears
  - [ ] 11.4* Test: MSW returns `{ products: [], total: 0, totalPages: 0 }` → `<EmptyState>` renders with "No products match your filters." and a link to `/products`
  - [ ] 11.5* Test: render with `?category=shoes&minPrice=1000`, click "Clear all filters" → assert `router.push` called with `/products` (no query params)
  - [ ] 11.6* Test: render with `?page=99`, MSW returns `{ totalPages: 2 }` → assert `redirect` invoked with `?page=2`
  - _Requirements: R2.2, R2.5, R3.2, R6.3, R6.4, R6.6_

- [ ] 12. Write end-to-end tests (Playwright)
  - [ ] 12.1* E2E: Navigate `/products` → check "Bags" and "Shoes" → change sort to "Newest First" → go to page 2 → assert URL is `?category=bags&category=shoes&sort=newest&page=2` and product grid contains 24 items
  - [ ] 12.2* E2E: Open `/products?category=shoes&sort=price_asc&page=2` in a fresh browser context (no cookies, no prior navigation) → assert visible product names match server-rendered fixture (R4.2)
  - [ ] 12.3* E2E: Apply "Shoes" filter → click first product card link → press browser Back → assert URL restored to `?category=shoes`, product grid visible, `aria-live` region announces count (R4.3)
  - [ ] 12.4* E2E: Tab through all interactive elements on default state → assert focus order matches DOM order, all controls reachable without mouse, pagination "Previous" button announces `aria-disabled` (R7.1)
  - [ ] 12.5* E2E: Run `axe` scan in Playwright on default, filtered, error, and empty states → assert zero violations (R7.6)
  - _Requirements: R4.2, R4.3, R5.1, R5.6, R7.1, R7.6_

- [ ] 13. Performance validation and bundle audit
  - [ ] 13.1 Run `next build && next-bundle-analyzer` and confirm that the combined Client Component JS for the products route is < 40 KB gzipped; refactor any oversized component
  - [ ] 13.2 Verify with React DevTools that `<ProductGrid>`, `<ProductCard>`, and `<EmptyState>` are Server Components (no "use client" label); confirm only the five interactive components show the Client Component badge
  - [ ] 13.3 Run Lighthouse CI (`lhci autorun`) targeting `/products` and assert: LCP < 2 500 ms, CLS < 0.1, INP < 200 ms on both desktop (1 280 × 800) and mobile (375 × 812) viewports
  - [ ] 13.4 Add a code comment above `<ul>` in `ProductGrid.tsx` documenting the virtualization threshold: "If pageSize exceeds 100 (e.g. infinite-scroll variant), refactor to @tanstack/react-virtual to avoid DOM bloat."
  - _Requirements: R1.4, R6.1_

# Implementation Plan: Analytics Dashboard

## Overview

This plan delivers the Analytics Dashboard in dependency order: data types and URL utilities first, then server-side API layer and Route Handlers, then the page skeleton and Suspense structure, then individual widgets, then accessibility and export, and finally testing and verification. Every top-level task produces a working, committable increment.

## Tasks

- [ ] 1. Define TypeScript interfaces and filter utilities
  - [ ] 1.1 Create `app/(app)/dashboard/_lib/types.ts` with `KpiMetric`, `TimeSeriesPoint`, `TimeSeriesResponse`, `BreakdownRow`, `BreakdownResponse`, `DashboardFilters`, and `DEFAULT_FILTERS` as specified in the design data models
  - [ ] 1.2 Create `app/(app)/dashboard/_lib/granularity.ts` implementing `inferGranularity(from: string, to: string): 'hourly' | 'daily' | 'weekly'` — ≤ 7 days → `'hourly'`, 8–90 days → `'daily'`, > 90 days → `'weekly'`
  - [ ] 1.3 Create `app/(app)/dashboard/_lib/filters.ts` implementing `parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters` — validate ISO dates (coerce invalid to Last 30 days), infer `preset` from date range, extract `region` and `channel` params
  - [ ] 1.4 Create `app/(app)/dashboard/_lib/url.ts` implementing `buildDashboardUrl(override: Partial<DashboardFilters>, current: URLSearchParams): string` — omit params equal to defaults, include `from`/`to` only when `preset === 'custom'`
  - [ ] 1.5 Write Vitest unit tests for `parseDashboardFilters`: valid dates, invalid dates → defaults + console.warn, missing params → defaults, preset inference
  - [ ] 1.6 Write Vitest unit tests for `buildDashboardUrl`: default `preset=last30` omitted, custom range includes `from`/`to`, dimension params appended correctly
  - [ ] 1.7 Write Vitest unit tests for `inferGranularity`: boundary cases (exactly 7 days → hourly, exactly 8 days → daily, exactly 90 days → daily, 91 days → weekly)
  - _Requirements: R4.2, R4.6, R2.3_

- [ ] 2. Implement Route Handlers and server-side fetch helpers
  - [ ] 2.1 Create `app/api/dashboard/kpis/route.ts` as a `GET` Route Handler; accept `from`, `to`, `region`, `channel` query params; proxy to Analytics API; `export const revalidate = 300`
  - [ ] 2.2 Create `app/api/dashboard/time-series/route.ts` as a `GET` Route Handler; accept same params plus `metric` and `granularity`; `export const revalidate = 60`
  - [ ] 2.3 Create `app/api/dashboard/breakdown/route.ts` as a `GET` Route Handler; accept `dimension`, `metric`, `from`, `to`, `region`, `channel`; `export const revalidate = 60`
  - [ ] 2.4 Create `app/(app)/dashboard/_lib/api.ts` with `fetchKpis(f: DashboardFilters): Promise<KpiMetric[]>`, `fetchTimeSeries(f: DashboardFilters): Promise<TimeSeriesResponse>`, `fetchBreakdown(f: DashboardFilters): Promise<BreakdownResponse>` — use `fetch` with `{ next: { revalidate } }`, throw typed `ApiError` on 5xx, redirect to login on 401
  - [ ] 2.5 Create MSW request handlers in `src/mocks/handlers/dashboard.ts` with realistic fixture data for all three endpoints
  - _Requirements: R1.1, R2.1, R3.1, R5.3, R5.5_

- [ ] 3. Build page shell and Suspense structure
  - [ ] 3.1 Create `app/(app)/dashboard/page.tsx` as an `async` Server Component; call `parseDashboardFilters(searchParams)`, then `Promise.all([fetchKpis, fetchTimeSeries, fetchBreakdown])`; on invalid date params call `redirect` to canonical URL with default params and log `console.warn`
  - [ ] 3.2 Compose the page layout: `<Toolbar initialFilters={filters} />` at top, then a CSS Grid wrapper (`grid grid-cols-1 md:grid-cols-2 gap-6`) containing `<Suspense fallback={<KpiTileSkeleton count={4} />}><KpiSection /></Suspense>`, `<Suspense fallback={<ChartSkeleton />}><LineChartSection /></Suspense>`, `<Suspense fallback={<ChartSkeleton />}><BarChartSection /></Suspense>`
  - [ ] 3.3 Create `app/(app)/dashboard/loading.tsx` rendering `<DashboardSkeleton>` — used as automatic Suspense fallback during slow navigations
  - [ ] 3.4 Create `app/(app)/dashboard/error.tsx` as a Client Component Error Boundary rendering `<DashboardError onRetry={reset} />`
  - [ ] 3.5 Dynamically import `<LineChartWidget>` and `<BarChartWidget>` with `next/dynamic({ ssr: false })` so recharts is not included in the server HTML
  - _Requirements: R1.4, R5.1, R5.5_

- [ ] 4. Build KPI Tiles
  - [ ] 4.1 Create `app/(app)/dashboard/_components/KpiTileSkeleton.tsx` rendering a pulsing `<div className="animate-pulse bg-gray-200 rounded-lg h-28">` matching the dimensions of `<KpiTile>`
  - [ ] 4.2 Create `app/(app)/dashboard/_components/KpiTile.tsx` (Server Component); accept `metric: KpiMetric`; format `value` and `priorValue` using `Intl.NumberFormat` per `metric.format`; compute `change = value - priorValue` and `changePct`; render "—" when value is null
  - [ ] 4.3 In `<KpiTile>`, render an arrow icon (`▲` / `▼` / `—`) with `aria-hidden="true"` and a `<span className="sr-only">` with `aria-label` text: "Increased by X%", "Decreased by X%", or "No change" (R1.2)
  - [ ] 4.4 Apply responsive KPI grid: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` in a `<KpiSection>` wrapper Server Component
  - [ ] 4.5 Write RTL unit tests for `<KpiTile>`: positive change → green color class + "Increased" sr-only label; negative → red + "Decreased"; null value → "—" displayed; currency formatted correctly
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6_

- [ ] 5. Build Line Chart widget
  - [ ] 5.1 Create `app/(app)/dashboard/_components/LineChartWidget.tsx` (`'use client'`, dynamically imported); render `recharts <ResponsiveContainer height={320}><LineChart>` with `<XAxis>` (formatted dates), `<YAxis>` (formatted numbers, granularity label), `<Tooltip>`, `<Legend>`, and one `<Line>` per series with `strokeDasharray` for the secondary series
  - [ ] 5.2 Implement keyboard-focusable data points: overlay transparent `<button>` elements absolutely positioned over each data point; on focus show tooltip, on Escape hide it; use `aria-label="[date]: [value]"` on each button
  - [ ] 5.3 Wire `<LineChartWidget>` to show `<EmptyState>` when `points.length === 0` and `<ErrorState onRetry={...} attemptCount={n}>` on fetch failure
  - [ ] 5.4 Create `app/(app)/dashboard/_components/AccessibleDataTable.tsx` (`'use client'`); visually hidden by default (`className="sr-only"`); toggled by "Show data table" / "Hide data table" `<button>`; renders `<table>` with `<caption>`, `<thead>` (Date + series labels), `<tbody>` (one row per time point)
  - [ ] 5.5 Write RTL unit tests for `<AccessibleDataTable>`: initially has `sr-only` class; after button click has visible class; table has correct `<caption>` and column headers
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R7.3, R7.4_

- [ ] 6. Build Bar Chart widget
  - [ ] 6.1 Create `app/(app)/dashboard/_components/BarChartWidget.tsx` (`'use client'`, dynamically imported); render `recharts <BarChart>` with bars sorted by value descending; label each bar directly with `<LabelList position="top">`
  - [ ] 6.2 Implement click-to-filter: in `onClick` handler call `router.push(buildDashboardUrl({ [dimensionKey]: clickedValue }, currentSearchParams))` inside `useTransition`
  - [ ] 6.3 Implement expand/collapse for > 12 bars: slice `rows.slice(0, 12)` by default; render "Show all [N] categories" `<button>` that sets `isExpanded = true` and re-renders all bars with a `max-h` CSS transition
  - [ ] 6.4 Wire `<ErrorState>` and `<EmptyState>` for breakdown fetch failures and zero-row responses (R3.4, R5.2, R5.3)
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 7. Build Toolbar (Date-range Picker + Dimension Filters)
  - [ ] 7.1 Create `app/(app)/dashboard/_components/Toolbar.tsx` (`'use client'`); accept `initialFilters: DashboardFilters`; read live filters from `useSearchParams()`; wrap all `router.push` calls in `useTransition`; show loading spinner on `isPending`
  - [ ] 7.2 Create `app/(app)/dashboard/_components/DateRangePicker.tsx` (`'use client'`); render preset buttons (Today, Last 7 days, Last 30 days, Last 90 days, Custom) and a calendar grid for custom selection; validate end ≥ start, show "End date must be after start date" inline on violation; apply ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-controls`, Escape-to-close)
  - [ ] 7.3 Create `app/(app)/dashboard/_components/DimensionFilterDropdown.tsx` (`'use client'`); accept `dimension: string` and `options: string[]`; render a `<button aria-haspopup="listbox" aria-expanded>` and a `<ul role="listbox">` with `<li role="option" aria-selected>`; arrow-key navigation, Enter/Space to select, Escape to close
  - [ ] 7.4 Wire "Clear all filters" button in Toolbar: calls `router.push(buildDashboardUrl(DEFAULT_FILTERS, new URLSearchParams()))`, resetting to Last 30 days with no dimension filters (R4.5)
  - [ ] 7.5 Write RTL integration tests: select "Last 7 days" preset → assert `router.push` called with correct `from`/`to` params; apply region filter → assert `?region=APAC` in URL; clear filters → assert URL is `/dashboard` with only default params
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R4.7_

- [ ] 8. Implement data export
  - [ ] 8.1 Create `app/(app)/dashboard/_lib/export.ts` with `generateCsv(rows: Record<string, unknown>[], filename: string): void` — build CSV string with header row, one data row per object (values stringified, no currency symbols), create `Blob(['text/csv'])`, trigger download via `<a download>`
  - [ ] 8.2 Add `generateJson(data: unknown, filename: string): void` to `export.ts` — `JSON.stringify(data, null, 2)`, create `Blob(['application/json'])`, trigger download
  - [ ] 8.3 Create `app/(app)/dashboard/_components/ExportMenu.tsx` (`'use client'`); render "Export" dropdown with "Download CSV" and "Download JSON" menu items; for exports > 10 000 rows show a `<dialog>` modal with "Proceed" / "Cancel" before generating the file; fire `trackEvent('data_export', { format, row_count })`
  - [ ] 8.4 Write Vitest unit tests for `generateCsv`: correct header, correct rows, no currency symbols, correct filename pattern; test `generateJson`: valid JSON, correct filename
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6_

- [ ] 9. Accessibility audit and ARIA wiring
  - [ ] 9.1 Add `aria-label` / `title` prop to all `recharts` chart components: `<LineChart title="Daily Active Users, {from} – {to}">` and `<BarChart title="Revenue by {dimension}, {from} – {to}">`
  - [ ] 9.2 Set `aria-busy="true"` on each widget container while its Suspense fallback is active; use a `<WidgetLoadingWrapper>` Client Component that tracks `isPending` from `useTransition` and sets the attribute
  - [ ] 9.3 Confirm `<DateRangePicker>` calendar grid uses `role="grid"`, `role="gridcell"`, `aria-selected`, and arrow-key navigation; run manual keyboard test in Chrome
  - [ ] 9.4 Run `@axe-core/react` in development on the default, loading, empty, and error states; resolve all violations before proceeding
  - [ ] 9.5* Add focus-management `useEffect` in `Toolbar`: when `isPending` transitions `true → false`, move focus to the first KPI tile heading (`#kpi-section h3:first-child`)
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

- [ ] 10. End-to-end verification
  - [ ] 10.1 Run `next build && next start`; navigate to `/dashboard` (with a test authenticated session); assert KPI tiles, line chart, and bar chart are all visible with real or seeded fixture data
  - [ ] 10.2 Change date range to "Last 7 days" and confirm charts update and x-axis label shows hourly granularity; apply region filter and confirm all widgets reflect the filter
  - [ ] 10.3 Click a bar in the bar chart; confirm the URL updates with the dimension filter and all other widgets re-render with the new filter applied
  - [ ] 10.4 Trigger an error state: disable the Analytics API mock or network; confirm `<ErrorState>` renders per widget; click "Retry" and confirm recovery
  - [ ] 10.5 Click "Download CSV"; open the downloaded file and verify header row matches column names and row count matches the API fixture row count
  - [ ] 10.6 Run `npx playwright test` against the full E2E suite; confirm all tests pass including the axe scan and LCP/CLS assertions
  - _Requirements: R1.1, R2.1, R3.1, R4.2, R5.3, R6.2, R7.2_

- [ ] 11. Update documentation
  - [ ] 11.1 Update project `README.md` or `docs/dashboard.md` with: Analytics API endpoint configuration (`ANALYTICS_API_BASE_URL`, `ANALYTICS_API_KEY`), how to add a new KPI metric (add to `KpiMetric[]` fixture and API response), how to add a new dimension filter (add to `DashboardFilters` type and `Toolbar` props), and how to run the E2E test suite
  - [ ] 11.2 Add inline JSDoc comments to `fetchKpis`, `fetchTimeSeries`, and `fetchBreakdown` documenting the caching strategy and when to increase/decrease `revalidate` intervals
  - _Requirements: R1.1, R4.1, R5.1_

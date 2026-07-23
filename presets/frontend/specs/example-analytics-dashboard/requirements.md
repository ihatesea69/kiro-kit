# Requirements Document

## Introduction

The Analytics Dashboard is an authenticated, data-rich page built with Next.js App Router and React Server Components that gives product managers and data analysts a real-time overview of key business metrics. It presents KPI summary tiles, interactive line and bar charts, and a data table, all of which respond to a shared date-range picker and dimension filters. Data is fetched server-side with appropriate caching and can be exported to CSV or JSON for offline analysis.

## Glossary

- **KPI Tile**: A card displaying a single key performance indicator — current value, change from a prior period (absolute and percentage), and a trend direction indicator.
- **Line Chart**: A time-series chart plotting one or more metrics over the selected date range using connected data points.
- **Bar Chart**: A categorical chart comparing metric values across dimensions (e.g., revenue by channel) using vertical bars.
- **Date-Range Picker**: A UI control allowing the user to choose a start and end date, or a preset range (Today, Last 7 days, Last 30 days, Last 90 days, Custom).
- **Dimension Filter**: A dropdown or multi-select control that narrows the dataset by a categorical attribute such as region, product line, or user segment.
- **Granularity**: The time interval at which time-series data is grouped — hourly, daily, or weekly.
- **Empty State**: The visual shown when a query returns zero data points for the selected filters and date range.
- **Skeleton UI**: A pulsing placeholder that matches the shape of real content, shown while data is loading.
- **Export**: Downloading dashboard data as a flat file (CSV or JSON) for offline use.
- **WCAG 2.1 AA**: Web Content Accessibility Guidelines 2.1 at conformance level AA — the accessibility standard this dashboard must meet.
- **LCP**: Largest Contentful Paint — Core Web Vitals metric targeting < 2.5 s.
- **INP**: Interaction to Next Paint — Core Web Vitals metric targeting < 200 ms.
- **CLS**: Cumulative Layout Shift — Core Web Vitals metric targeting < 0.1.
- **RSC**: React Server Component — a component rendered exclusively on the server with no client-side JavaScript bundle.
- **SWR**: Stale-While-Revalidate — a cache pattern that returns a stale response immediately while revalidating in the background.

## Out of Scope

- Authentication and session management — this spec assumes the user is already authenticated; route protection (`middleware.ts`) is handled elsewhere.
- Real-time streaming (WebSocket/SSE) — data is refreshed on user action or on a configurable polling interval (R5), not pushed by the server.
- Dashboard customisation (drag-and-drop widget reordering, adding/removing charts) — the layout is fixed.
- Writing back to any data source (annotations, comments, alerts) — the dashboard is read-only.
- Advanced statistical functions (forecasting, anomaly detection, regression) — raw aggregated metrics only.
- Mobile-native (React Native/Expo) — responsive web only.
- Multi-tenancy or workspace switching — scoped to the authenticated user's organisation.

## Requirements

### Requirement 1: KPI Summary Tiles

**User Story:** As a product manager, I want to see the most important metrics at a glance as soon as I open the dashboard, so that I can assess business health without scrolling or clicking.

#### Acceptance Criteria

1. WHEN the dashboard page loads THE SYSTEM SHALL render a row of KPI tiles above the charts section, each tile displaying: a metric label, the current-period value formatted for its type (currency, integer count, or percentage), the absolute change from the prior period, the percentage change from the prior period, and a directional arrow icon (up/down/neutral).
2. WHEN the change value is positive and represents improvement (e.g., revenue up, churn down) THE SYSTEM SHALL color the change indicator green and set `aria-label` on the icon to "Increased"; when it represents deterioration THE SYSTEM SHALL color it red and set `aria-label` to "Decreased"; when there is no change THE SYSTEM SHALL color it grey and set `aria-label` to "No change".
3. WHERE KPI tiles are rendered THE SYSTEM SHALL use a responsive grid: 2 columns on viewports < 640 px, 3 columns at 640–1 023 px, and 4 columns at ≥ 1 024 px, using CSS Grid with `gap-4`.
4. WHEN a KPI tile's data is loading THE SYSTEM SHALL display a skeleton placeholder matching the tile's dimensions (pulsing grey rectangle) until the data resolves, ensuring the CLS score contribution from tiles is zero.
5. IF the API returns no data for a KPI metric THE SYSTEM SHALL display "—" in place of the value and suppress the change indicator rather than showing NaN or a division-by-zero result.
6. WHEN the user changes the date range or applies a dimension filter THE SYSTEM SHALL re-fetch KPI data and update all tiles simultaneously; the transition must complete within 200 ms of the response arriving (INP target).

### Requirement 2: Line Chart — Time-Series View

**User Story:** As a data analyst, I want to visualise how a key metric has trended over the selected date range, so that I can identify growth patterns, anomalies, and seasonality.

#### Acceptance Criteria

1. WHEN the date range is set THE SYSTEM SHALL render a line chart displaying the primary metric (e.g., Daily Active Users or Revenue) over time, with the x-axis representing date/time and the y-axis representing the metric value, using a chart library (`recharts` or `@nivo/line`).
2. WHEN the user hovers or focuses on a data point THE SYSTEM SHALL display a tooltip showing the exact date and formatted value; the tooltip must be dismissible with Escape and must not obscure adjacent data points.
3. WHEN the selected date range spans ≤ 7 days THE SYSTEM SHALL set granularity to hourly; when it spans 8–90 days THE SYSTEM SHALL use daily granularity; when it spans > 90 days THE SYSTEM SHALL use weekly granularity, and include the granularity label in the y-axis title.
4. IF the time-series data contains zero data points for the selected filters THE SYSTEM SHALL replace the chart area with the empty-state component described in Requirement 5 rather than rendering an empty axis.
5. WHERE the line chart uses color to distinguish multiple series THE SYSTEM SHALL also use distinct line dash patterns (solid, dashed, dotted) so that the chart is readable in greyscale and by colorblind users (WCAG 1.4.1).
6. WHEN the chart is rendered THE SYSTEM SHALL expose all data points as an accessible data table (`<table>` with `<caption>`, `<thead>`, `<tbody>`) visually hidden but available to screen readers, togglable via a "Show data table" button above the chart.

### Requirement 3: Bar Chart — Dimension Breakdown

**User Story:** As a product manager, I want to compare metric values across categorical dimensions (e.g., revenue by region or signups by channel), so that I can identify which segments are driving or lagging performance.

#### Acceptance Criteria

1. WHEN a dimension filter is active THE SYSTEM SHALL render a bar chart grouping the selected metric by that dimension, with bars sorted by value descending by default, using `recharts BarChart` or `@nivo/bar`.
2. WHEN the user clicks a bar THE SYSTEM SHALL apply that dimension value as an additional filter to all charts and KPI tiles on the page, updating the URL query string with the selected dimension value.
3. WHEN the bar chart renders more than 12 categories THE SYSTEM SHALL display only the top 12 bars and add an "Show all [N] categories" button below the chart that expands to show all bars with a CSS height transition.
4. IF a bar chart data fetch returns an HTTP error THE SYSTEM SHALL display the error state described in Requirement 5 with a "Retry" button that re-fires the identical query.
5. WHERE the bar chart uses color to encode dimension values THE SYSTEM SHALL also label each bar directly with the dimension name (or use a clearly labeled legend) so color is not the sole differentiator.

### Requirement 4: Date-Range Picker and Dimension Filters

**User Story:** As a data analyst, I want to adjust the date range and filter by dimensions without a full page reload, so that I can quickly compare different slices of data during my analysis session.

#### Acceptance Criteria

1. WHEN the dashboard is rendered THE SYSTEM SHALL display a date-range picker control offering preset options — Today, Last 7 days, Last 30 days, Last 90 days, and a Custom date range — and a dimension filter dropdown for each available dimension (e.g., Region, Channel).
2. WHEN the user selects a preset range THE SYSTEM SHALL update the `from` and `to` URL query parameters (ISO 8601 date strings), trigger a re-fetch of all dashboard data, and close the picker.
3. WHEN the user selects a Custom date range THE SYSTEM SHALL render a date-range calendar allowing selection of start and end dates; THE SYSTEM SHALL validate that the end date is not before the start date and display "End date must be after start date" inline if violated, preventing submission.
4. WHEN the user applies a dimension filter THE SYSTEM SHALL append the filter as a URL query parameter (e.g., `?region=APAC`) and re-fetch all charts and KPI tiles with the new dimension constraint.
5. WHEN the user clears all filters and resets the date range THE SYSTEM SHALL remove all non-default query parameters from the URL and re-fetch with the default range (Last 30 days).
6. IF the `from` or `to` URL parameter contains an invalid date string THE SYSTEM SHALL silently coerce it to the default range (Last 30 days), log a `console.warn`, and redirect the user to the canonical URL without the invalid parameters.
7. WHERE filter controls are rendered THE SYSTEM SHALL ensure all pickers and dropdowns are keyboard-operable: openable with Enter/Space, navigable with arrow keys, closable with Escape (WCAG 2.1 AA, keyboard pattern 4.1.3).

### Requirement 5: Loading, Empty, and Error States

**User Story:** As a dashboard user, I want clear feedback when data is loading, unavailable, or empty, so that I am never confused by a blank widget or a silent failure.

#### Acceptance Criteria

1. WHILE a data fetch is in progress for any chart or tile section THE SYSTEM SHALL display a skeleton placeholder matching the target widget's dimensions, preventing any layout shift (CLS contribution = 0).
2. IF all data fetches resolve with zero data points for the selected date range and filters THE SYSTEM SHALL display an empty-state message per widget: "No data for this period" with a suggestion to widen the date range or clear filters, plus a "Reset filters" button.
3. IF a data fetch returns a network error or HTTP 5xx response THE SYSTEM SHALL replace that widget with an error-state component showing "Unable to load [widget name]. Try again." and a "Retry" button that re-fires the failed request.
4. WHEN the "Retry" button is activated THE SYSTEM SHALL immediately re-fetch the failed widget; on continued failure THE SYSTEM SHALL append "(Attempt [N])" to the error message and keep the "Retry" button enabled.
5. IF the user's session has expired and the API returns HTTP 401 THE SYSTEM SHALL redirect the user to the authentication page, preserving the current dashboard URL as a `?redirect=` parameter so they can return after re-authenticating.
6. WHILE any data fetch is in progress THE SYSTEM SHALL set `aria-busy="true"` on the corresponding widget container and render the skeleton with `role="status"` and `aria-label="Loading [widget name]"` for screen readers.

### Requirement 6: Data Export

**User Story:** As a data analyst, I want to download the currently visible dashboard data as a CSV or JSON file, so that I can perform deeper analysis in spreadsheet or BI tools outside the browser.

#### Acceptance Criteria

1. WHEN the export controls are rendered THE SYSTEM SHALL display an "Export" button or dropdown offering "Download CSV" and "Download JSON" options, positioned in the dashboard toolbar alongside the filter controls.
2. WHEN the user selects "Download CSV" THE SYSTEM SHALL generate a UTF-8 encoded CSV file with: a header row matching the data column names, one data row per time-series data point, all values formatted as plain strings (no currency symbols), and a filename of `analytics-{from}-to-{to}.csv`.
3. WHEN the user selects "Download JSON" THE SYSTEM SHALL generate a JSON file containing the full API response payload for the current query as a pretty-printed JSON array, with filename `analytics-{from}-to-{to}.json`.
4. WHEN an export file is generated THE SYSTEM SHALL trigger the browser file download via `URL.createObjectURL(blob)` + a programmatically clicked `<a download>` element, without navigating away from the dashboard.
5. IF the dataset for the current filters contains more than 10 000 rows THE SYSTEM SHALL display a warning modal: "This export contains [N] rows and may take a moment." with "Proceed" and "Cancel" buttons, before initiating the download.
6. WHERE the export is initiated THE SYSTEM SHALL fire an analytics event `{ action: 'data_export', format: 'csv' | 'json', row_count: number }`.

### Requirement 7: Responsive Layout and Accessibility

**User Story:** As a dashboard user who relies on a keyboard or screen reader, I want to access all dashboard controls, data, and chart information without a mouse, so that I have an equivalent analytical experience.

#### Acceptance Criteria

1. WHERE the dashboard is rendered THE SYSTEM SHALL use a responsive CSS Grid layout: a single-column stack on viewports < 768 px (filters collapsed into a drawer), a two-column chart grid on 768–1 279 px, and a two-column chart grid with sidebar filters on ≥ 1 280 px.
2. WHEN the page is rendered THE SYSTEM SHALL pass a WCAG 2.1 AA automated audit (zero violations via `axe-core`) including: all chart SVG elements have descriptive `aria-label` or `aria-labelledby` attributes, color-only encoding is always supplemented by patterns or labels, and all interactive controls have visible focus rings.
3. WHERE chart tooltips are rendered THE SYSTEM SHALL ensure they are accessible to keyboard users by implementing focus-based tooltip activation in addition to hover-based activation (i.e., when a data point receives keyboard focus the tooltip appears).
4. WHEN screen-reader users navigate the dashboard THE SYSTEM SHALL expose each chart's data as an accessible `<table>` (togglable via "Show data table" button), with `<caption>` describing the chart name and date range, `<th scope="col">` for date column, and `<th scope="col">` for each metric column.
5. WHERE filter and date-range controls are rendered THE SYSTEM SHALL ensure all dropdowns and pickers follow ARIA authoring patterns: `role="combobox"` for the date input, `role="listbox"` for preset options, `aria-expanded` state reflecting open/closed, and Escape closing the control without applying changes.
6. WHEN color alone would indicate KPI tile trend direction (green = up, red = down) THE SYSTEM SHALL also include a text label or arrow icon with a non-color `aria-label` (R1.2) so the information is available to colorblind users and screen readers.

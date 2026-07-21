# Requirements Document

## Introduction

The Product Listing Page (PLP) provides shoppers with a browsable, filterable, and paginated catalog of products within a Next.js 14+ App Router storefront. It is the primary discovery surface between category navigation and the product detail page, and must deliver a fast, accessible experience that works without client-side JavaScript for initial content rendering. All filter, sort, and pagination state is encoded in the URL query string so that any view can be bookmarked or shared.

## Glossary

- **PLP**: Product Listing Page — the route that displays a grid of products for a given category or search context.
- **Product**: A purchasable item with attributes such as name, price, category, image URL, and availability.
- **Filter**: A user-applied constraint that narrows the visible product set, e.g., one or more categories or a price range.
- **Active Filters**: The set of filters currently applied, reflected in the URL query string and shown as dismissible chips in the Active Filter Bar.
- **Sort Order**: The sequence criterion by which products are listed (relevance, price ascending/descending, or newest first).
- **Pagination**: The mechanism for dividing a large result set into fixed-size pages (24 products per page) navigated via page-number links.
- **URL State**: The encoding of filter, sort, and page parameters as URL query parameters, enabling link sharing and browser back/forward navigation.
- **Skeleton UI**: A placeholder layout displayed during data loading that matches the shape of real product cards to prevent layout shift.
- **WCAG 2.1 AA**: Web Content Accessibility Guidelines version 2.1 at conformance level AA — the accessibility standard this feature must meet.
- **LCP**: Largest Contentful Paint — a Core Web Vitals metric targeting < 2.5 s.
- **CLS**: Cumulative Layout Shift — a Core Web Vitals metric targeting < 0.1.
- **INP**: Interaction to Next Paint — a Core Web Vitals metric targeting < 200 ms.
- **Server Component**: A React component rendered exclusively on the server; it can fetch data directly but cannot use browser APIs or React hooks.
- **Client Component**: A React component that hydrates in the browser; required for interactivity such as filter controls and sort selects.

## Requirements

### Requirement 1: Server-Rendered Product List

**User Story:** As a shopper, I want to see a list of products rendered on first load without waiting for client-side JavaScript, so that the page loads quickly and search engines can index product content.

#### Acceptance Criteria

1. WHEN a user navigates to `/products` or any URL of the form `/products?<query>` THE SYSTEM SHALL render the product grid as HTML on the server using Next.js App Router dynamic rendering and return a 200 HTTP response that includes product content in the initial HTML payload.
2. WHEN the server fetches product data THE SYSTEM SHALL call `GET /api/products` passing `category` (repeatable), `minPrice`, `maxPrice`, `sort`, and `page` query parameters derived from the current request URL.
3. WHEN the product list is rendered THE SYSTEM SHALL display each product card containing: the product name, a primary image sourced from `next/image`, the formatted price (e.g., "$49.99"), a category badge, and an anchor element linking to `/products/[slug]`.
4. IF the `GET /api/products` request takes longer than 3 000 ms to resolve THE SYSTEM SHALL stream the page shell (header, filter panel, sort control) to the browser immediately and render the product grid inside a `<Suspense>` boundary, displaying a skeleton grid until the data resolves.
5. WHERE the product grid is rendered THE SYSTEM SHALL apply a responsive CSS grid: 1 column on viewports < 640 px, 2 columns at 640–1 023 px, 3 columns at 1 024–1 279 px, and 4 columns at ≥ 1 280 px.

### Requirement 2: Client-Side Filtering

**User Story:** As a shopper, I want to filter products by category and price range without a full page reload, so that I can quickly narrow the product set to items that interest me.

#### Acceptance Criteria

1. WHEN the filter panel is visible THE SYSTEM SHALL display a category multi-select list (checkboxes) populated from `GET /api/categories` and a dual-handle price-range slider whose lower and upper bounds are set to the minimum and maximum prices present in the current result set.
2. WHEN the user selects or deselects a category checkbox THE SYSTEM SHALL update the `category` URL query parameter (repeatable, e.g., `?category=shoes&category=bags`), reset the `page` parameter to `1`, and re-fetch the product list without triggering a full page navigation.
3. WHEN the user releases the price-range slider handles after adjusting them THE SYSTEM SHALL update the `minPrice` and `maxPrice` URL query parameters (integer values in cents), reset `page` to `1`, and re-fetch the product list.
4. IF no products match the applied filters THE SYSTEM SHALL render the empty-state component described in Requirement 6 in place of the product grid.
5. WHEN the user activates the "Clear all filters" button THE SYSTEM SHALL remove the `category`, `minPrice`, and `maxPrice` query parameters from the URL and restore the full unfiltered product list.
6. WHILE a filtered product list re-fetch is in progress THE SYSTEM SHALL keep the previous result set visible, overlay a semi-transparent loading mask and a spinner on the product grid, and set `aria-busy="true"` on the grid container, preventing layout shift.

### Requirement 3: Product Sorting

**User Story:** As a shopper, I want to sort the product list by relevance, price, or newest arrival, so that I can discover products in the order most useful to me.

#### Acceptance Criteria

1. WHEN the product list is displayed THE SYSTEM SHALL render a sort control (a native `<select>` element with a visible `<label>`) offering four options: "Relevance" (`sort=relevance`), "Price: Low to High" (`sort=price_asc`), "Price: High to Low" (`sort=price_desc`), and "Newest First" (`sort=newest`).
2. WHEN the user changes the sort selection THE SYSTEM SHALL update the `sort` URL query parameter, reset `page` to `1`, and re-fetch the product list without triggering a full page navigation.
3. IF the URL contains no `sort` parameter THE SYSTEM SHALL default the sort control selection to "Relevance" and pass `sort=relevance` to the API request.
4. IF the URL contains an unrecognized `sort` value THE SYSTEM SHALL silently coerce it to `relevance`, correct the URL parameter, and log a `console.warn` message identifying the invalid value.

### Requirement 4: URL-Synced Filter and Pagination State

**User Story:** As a shopper, I want to share the URL of a filtered and paginated product view with another person, so that they see exactly the same results without having to re-apply my filters manually.

#### Acceptance Criteria

1. WHEN the user applies a filter, changes the sort order, or navigates to a different page THE SYSTEM SHALL call `router.push` with `{ scroll: false }` to update the URL query string without a full page reload or loss of current scroll position.
2. WHEN a user opens a pre-built filtered URL (containing `category`, `minPrice`, `maxPrice`, `sort`, and/or `page` parameters) in a new browser tab THE SYSTEM SHALL server-render the product grid with exactly the filters, sort order, and page number encoded in that URL.
3. WHEN the user presses the browser Back button after modifying filters THE SYSTEM SHALL restore the previous filter state and product list that corresponded to the prior URL history entry.
4. WHERE URL query parameters are serialized THE SYSTEM SHALL omit any parameter whose value equals its default (`sort=relevance`, `page=1`, empty `category` array, absent `minPrice`/`maxPrice`) in order to keep URLs canonical and human-readable.
5. IF a `page` value in the URL exceeds the total number of available pages for the current filters THE SYSTEM SHALL server-redirect the user to the last valid page URL and display an informational banner reading "Page [N] does not exist. Showing the last page."

### Requirement 5: Pagination

**User Story:** As a shopper, I want to navigate between pages of product results, so that I can browse a large catalog without being overwhelmed by an excessively long single list.

#### Acceptance Criteria

1. WHEN the product list contains more than 24 matching products THE SYSTEM SHALL paginate results at 24 products per page and render a pagination control below the product grid.
2. WHEN the pagination control is rendered THE SYSTEM SHALL display a "Previous" button, up to 5 page-number buttons centered on the current page with `...` ellipsis tokens for omitted ranges, and a "Next" button.
3. WHEN the user is on page 1 THE SYSTEM SHALL render the "Previous" button in a visually muted (reduced-opacity) disabled state and add `aria-disabled="true"` to it.
4. WHEN the user is on the last page THE SYSTEM SHALL render the "Next" button in a visually muted disabled state and add `aria-disabled="true"` to it.
5. WHEN the user activates a pagination button THE SYSTEM SHALL update the `page` URL query parameter and scroll the viewport to the top of the product grid element.
6. WHERE pagination controls are rendered THE SYSTEM SHALL use `<a>` anchor elements with `href` attributes containing the complete canonical URL for each target page (including current filter and sort params), so that the controls are crawlable by search engines and function without JavaScript.

### Requirement 6: Empty, Error, and Loading States

**User Story:** As a shopper, I want clear feedback when the product list is loading, empty, or unavailable, so that I am never left looking at a blank or broken page without knowing what to do next.

#### Acceptance Criteria

1. WHILE the product list is loading during initial page render THE SYSTEM SHALL display a skeleton grid of 12 product-card placeholders that match the height and width of real product cards, ensuring the CLS score remains below 0.1.
2. WHILE a client-side re-fetch triggered by a filter or page change is pending THE SYSTEM SHALL overlay a semi-transparent mask with a centered spinning indicator on the existing product grid and set `aria-busy="true"` on the grid container element.
3. IF the `GET /api/products` request fails with a network error or an HTTP 5xx response THE SYSTEM SHALL replace the product grid with an error-state component displaying the text "Something went wrong loading products." and a "Try again" button that retries the identical request.
4. IF the `GET /api/products` response contains zero products for the current filters THE SYSTEM SHALL display an empty-state component showing the text "No products match your filters.", a "Clear all filters" button that links to `/products`, and a list of up to 3 suggested alternative category links.
5. IF the `GET /api/products` request returns an HTTP 404 response THE SYSTEM SHALL invoke `notFound()` from `next/navigation`, rendering the application's standard 404 not-found page.
6. WHEN the user activates the "Try again" button after an error THE SYSTEM SHALL retry the failed request; on success THE SYSTEM SHALL replace the error state with the product grid; on continued failure THE SYSTEM SHALL keep the error state visible and append the text "(Attempt [N])" to the error message.

### Requirement 7: Keyboard and Screen-Reader Accessibility

**User Story:** As a shopper who uses a keyboard or assistive technology, I want to browse, filter, and paginate the product list without a mouse, so that I have an equivalent experience to sighted pointer users.

#### Acceptance Criteria

1. WHERE interactive elements exist on the page THE SYSTEM SHALL ensure all filter checkboxes, the price-range slider handles, the sort select, pagination buttons, and product card links are reachable by Tab / Shift+Tab and activatable with Enter or Space in the order they appear in the DOM.
2. WHEN the product grid is updated following a filter, sort, or page change THE SYSTEM SHALL move keyboard focus to the first product card link in the updated grid and update an `aria-live="polite"` region with the message "Showing [N] products" to inform screen-reader users of the result count.
3. WHERE the price-range slider is rendered THE SYSTEM SHALL expose it as two `<input type="range">` elements each with a distinct `aria-label` ("Minimum price" and "Maximum price"), and with `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` attributes set to the corresponding cent values, causing screen readers to announce the current value on change.
4. WHERE product cards are rendered THE SYSTEM SHALL ensure each product image has a non-empty `alt` attribute describing the product, and each card's primary link has a discernible accessible name equal to the product name.
5. WHEN color alone would convey the state of an element (active filter chip, selected category, disabled pagination button) THE SYSTEM SHALL also convey that state through a visible text label, icon, or non-color border/pattern so the information is not communicated by color alone (WCAG 2.1 SC 1.4.1).
6. WHERE any text content or interactive control is rendered THE SYSTEM SHALL ensure all text–background color combinations meet a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text and UI component boundaries per WCAG 2.1 SC 1.4.3 and SC 1.4.11.

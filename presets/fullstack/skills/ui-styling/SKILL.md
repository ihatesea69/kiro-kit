---
name: ui-styling
description: >-
  Style interfaces with Tailwind CSS, shadcn/ui components, and design tokens.
  Use when implementing visual designs, theming, or building accessible UI
  components.
license: MIT
version: 1.0.0
---

# UI Styling

Activate when styling components, implementing design systems, or working with Tailwind CSS and shadcn/ui.

## When to Use

- Styling components with Tailwind CSS utilities
- Using shadcn/ui components (built on Radix UI)
- Implementing dark mode and theming
- Creating responsive layouts
- Building accessible interactive components

## Tailwind CSS

- Use utility classes as primary styling method
- Use `cn()` helper for conditional classes (clsx + tailwind-merge)
- CSS variables for theme tokens in globals.css
- Responsive: mobile-first with breakpoint prefixes (sm:, md:, lg:)
- No inline styles except for dynamic values

## shadcn/ui

- Install components individually: `npx shadcn-ui@latest add button`
- Customize via CSS variables in globals.css
- Extend with Tailwind classes, not custom CSS
- Components are copied into your project (not a dependency)

## Accessibility

- Color contrast 4.5:1 for normal text, 3:1 for large text
- Focus-visible styles on all interactive elements
- Touch targets minimum 44x44px on mobile
- Respect prefers-reduced-motion
- Use semantic HTML and ARIA attributes

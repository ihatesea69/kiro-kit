---
name: ui-styling
description: Create accessible user interfaces with shadcn/ui components, Tailwind CSS utility-first styling, and Radix UI primitives. Use when building or styling UI components.
---

# UI Styling

Activate this skill when styling components or building UI with Tailwind CSS and shadcn/ui.

## When to Use

- Styling React components with Tailwind CSS
- Using shadcn/ui component library
- Implementing dark mode and theme switching
- Creating responsive layouts
- Building accessible form controls
- Customizing design tokens and theme

## Tailwind CSS Patterns

- Use utility classes directly in JSX
- Extract repeated patterns with `@apply` sparingly (prefer components)
- Use `cn()` utility for conditional class merging (clsx + tailwind-merge)
- Responsive: mobile-first with `sm:`, `md:`, `lg:`, `xl:` prefixes
- Dark mode: use `dark:` variant with class strategy
- Use CSS variables for dynamic theming

## shadcn/ui Usage

- Install components individually: `npx shadcn@latest add [component]`
- Components are copied into your project (not a dependency)
- Customize via `components/ui/` directory
- Built on Radix UI primitives (accessible by default)
- Style with Tailwind CSS and CSS variables

## Accessibility

- All interactive elements must be keyboard accessible
- Use proper ARIA attributes from Radix primitives
- Maintain focus management in dialogs and popovers
- Color contrast meets WCAG 2.1 AA standards
- Form inputs have associated labels and error messages

## Theme Configuration

- Define colors in `tailwind.config.ts` using CSS variables
- Use semantic color names (primary, secondary, muted, destructive)
- Support light and dark modes via CSS variables
- Consistent spacing scale (4px base unit)

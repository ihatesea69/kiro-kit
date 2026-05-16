---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, or applications that need polished visual design.
---

# Frontend Design

Activate this skill when creating UI components, pages, or layouts that require high visual quality and design thinking.

## When to Use

- Building new pages or features that need visual design decisions
- Creating component libraries or design systems
- Implementing responsive layouts with mobile-first approach
- Designing interactive elements with proper states and transitions
- Reviewing existing UI for design improvements

## Design Principles

- Mobile-first responsive design (320px, 768px, 1024px, 1440px breakpoints)
- Visual hierarchy through typography scale, spacing, and color
- Consistent spacing using 4px/8px grid system
- Purposeful use of whitespace for readability
- Progressive disclosure of complex information
- Accessible color contrast (WCAG 2.1 AA minimum)

## Implementation Guidelines

- Use semantic HTML elements for structure
- Apply Tailwind CSS utility classes for styling
- Implement proper focus states for keyboard navigation
- Add hover/active states for interactive elements
- Use CSS transitions for smooth state changes (150-300ms)
- Respect prefers-reduced-motion for animations
- Test across breakpoints before considering complete

## Color Usage

- Use design tokens from Tailwind config
- Maintain consistent color semantics (primary, secondary, destructive)
- Ensure 4.5:1 contrast ratio for normal text
- Ensure 3:1 contrast ratio for large text and UI elements
- Never use color as the sole indicator of state

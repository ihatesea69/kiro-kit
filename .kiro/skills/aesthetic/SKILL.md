---
name: aesthetic
description: Create aesthetically beautiful interfaces following proven design principles. Use when building UI that needs visual polish, micro-interactions, or design system refinement.
---

# Aesthetic Design

Activate this skill when interfaces need visual refinement, micro-interactions, or design system polish.

## When to Use

- Polishing UI components for production quality
- Adding micro-interactions and transitions
- Implementing visual hierarchy and rhythm
- Creating cohesive color palettes and themes
- Designing loading states and skeleton screens
- Adding subtle animations that enhance UX

## Design Principles

- Visual Hierarchy: guide the eye with size, weight, color, and spacing
- Rhythm and Repetition: consistent spacing creates visual harmony
- Contrast: use contrast purposefully to draw attention
- Whitespace: generous spacing improves readability and elegance
- Typography: limit to 2 font families, use clear type scale
- Color: use a constrained palette with intentional accent colors

## Micro-interactions

- Button press: subtle scale (0.98) with quick transition (100ms)
- Hover states: color shift or elevation change (150ms ease)
- Page transitions: fade or slide with shared layout animations
- Loading: skeleton screens over spinners for perceived performance
- Success/error: brief color flash or icon animation
- Scroll: parallax or reveal animations (respect reduced-motion)

## Implementation

```css
/* Smooth transitions */
.interactive {
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.interactive:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.interactive:active {
  transform: scale(0.98);
}
```

## Quality Checklist

- Consistent spacing using design tokens
- Smooth transitions on all state changes (no jarring jumps)
- Proper loading states (skeleton, not spinner)
- Accessible animations (prefers-reduced-motion respected)
- Touch-friendly targets (44px minimum)
- Visual feedback on every interaction

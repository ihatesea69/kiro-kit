---
name: frontend-design
description: Create production-grade frontend interfaces when backend services need admin panels, dashboards, or API documentation UIs. Use when building web interfaces for backend services.
---

# Frontend Design

Activate this skill when building admin panels, dashboards, or documentation UIs for backend services.

## When to Use

- Building admin dashboards for backend services
- Creating API documentation interfaces
- Designing monitoring and observability UIs
- Building internal tools and management panels

## Design Principles

- Function over form for internal tools
- Clear data presentation with tables and charts
- Responsive but desktop-first for admin interfaces
- Consistent spacing using 4px/8px grid system
- Accessible color contrast (WCAG 2.1 AA minimum)

## Implementation Guidelines

- Use semantic HTML elements for structure
- Keep styling minimal and functional
- Implement proper loading and error states
- Use server-rendered pages where possible
- Prioritize data density over visual flair for admin tools

## Rules

- Admin UIs should prioritize usability over aesthetics
- Always include loading states for async data
- Implement proper error handling with retry options
- Use pagination for large data sets
- Include search and filter capabilities for lists

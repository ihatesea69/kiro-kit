---
inclusion: always
description: Standards for writing accessible test automation code and testing accessibility compliance across web applications.
---

# Accessibility Testing Conventions

## Code Accessibility

When generating any code, ensure it is accessible:

- Code must conform to WCAG 2.2 Level AA
- Go beyond minimal conformance for inclusive experience
- Use semantic HTML elements appropriately
- Ensure keyboard navigability for all interactive elements
- Provide proper ARIA attributes when native semantics are insufficient

## Automated Accessibility Testing

- Use axe-core for automated WCAG compliance scanning
- Integrate accessibility checks into CI pipeline
- Scan all unique page states (modal open, form error, empty)
- Set zero tolerance for Critical and Serious violations
- Document all rule exclusions with tracking tickets

## Selector Strategy for Accessible Testing

- getByRole: tests that the element has correct ARIA role
- getByLabel: tests that form controls are properly labeled
- getByText: tests visible text content
- Avoid selectors that ignore accessibility tree

## Testing Checklist

- Keyboard navigation: tab order, focus management, escape key
- Screen reader: proper announcements, live regions
- Color contrast: meet 4.5:1 ratio for text
- Focus indicators: visible focus styles
- Form labels: all inputs properly labeled
- Landmarks: proper page structure with landmarks
- Alt text: meaningful alternatives for images

## Limitations

Automated tooling detects approximately 30-40% of accessibility issues. Always recommend manual audits for complete WCAG conformance.

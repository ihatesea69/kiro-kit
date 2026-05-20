# Visual Regression Testing Guide

## Approach

1. Capture baseline screenshots of stable UI
2. Run comparison after code changes
3. Highlight pixel differences
4. Review and approve or reject changes
5. Update baselines for intentional changes

## Configuration

- Browsers: Chrome, Firefox, Safari
- Viewports: mobile (375px), tablet (768px), desktop (1280px)
- Wait conditions: network idle, animations complete
- Masking: timestamps, ads, dynamic content

## Tools

- Playwright visual comparisons (built-in)
- Percy (cloud-based)
- Chromatic (Storybook integration)
- BackstopJS (self-hosted)

## Best Practices

- Mask dynamic content to reduce false positives
- Test component-level for focused coverage
- Wait for page stability before capture
- Use consistent viewport and font rendering
- Keep baselines in version control

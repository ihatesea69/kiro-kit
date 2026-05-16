---
name: ui-styling
description: Create platform-adaptive mobile interfaces with proper theming, responsive layouts, and design system components. Use when styling widgets or implementing design tokens.
---

# UI Styling

Activate this skill when styling mobile interfaces or implementing design systems.

## When to Use

- Implementing design tokens and theme systems
- Creating responsive layouts for different screen sizes
- Building platform-adaptive components (iOS vs Android styling)
- Implementing dark mode support
- Creating custom animations and transitions
- Establishing consistent spacing and typography scales

## Flutter Styling

- Use ThemeData for global theming
- Implement ColorScheme for Material 3 colors
- Use TextTheme for typography scale
- Leverage MediaQuery for responsive layouts
- Use LayoutBuilder for constraint-based sizing
- Implement custom painters for complex visuals

## React Native Styling

- Use StyleSheet.create for performance
- Implement design tokens as constants
- Use Platform.select for platform-specific styles
- Leverage Dimensions API for responsive sizing
- Use Reanimated for animated styles

## Design Principles

- 4px/8px spacing grid system
- Platform-native typography (SF Pro for iOS, Roboto for Android)
- Consistent elevation/shadow system
- Color semantics (primary, secondary, error, surface)
- Support for RTL layouts
- Accessible color contrast (4.5:1 minimum)

## Quality Standards

- All styles must support dark mode
- Typography must scale with system font size
- Layouts must handle different screen sizes gracefully
- Animations must respect reduced motion preferences
- Colors must meet WCAG 2.1 AA contrast requirements

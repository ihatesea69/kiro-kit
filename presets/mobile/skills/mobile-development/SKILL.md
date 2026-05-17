---
name: mobile-development
description: >-
  Build mobile applications with Flutter and React Native. Use when implementing
  screens, widgets, navigation, platform-specific features, or optimizing for
  mobile constraints.
license: MIT
version: 1.0.0
---

# Mobile Development

Activate this skill when building mobile applications with Flutter or React Native.

## When to Use

- Implementing new screens or widgets
- Setting up navigation and routing
- Integrating platform APIs (camera, location, sensors)
- Implementing offline-first data persistence
- Optimizing for mobile constraints (battery, memory, network)
- Handling platform-specific behavior differences
- Configuring build variants and signing

## Flutter Guidelines

- Use Dart 3+ with sound null safety
- Prefer StatelessWidget with const constructors
- Use BLoC or Riverpod for state management
- Follow effective Dart style guide
- Keep build methods under 80 lines
- Use go_router for navigation
- Implement proper widget keys for lists
- Use freezed for data classes

## React Native Guidelines

- TypeScript strict mode required
- Functional components with hooks only
- React Navigation for routing
- Use Reanimated for animations
- Platform-specific files: `.ios.tsx` / `.android.tsx`
- Hermes engine for production builds

## Platform Considerations

- iOS: follow Human Interface Guidelines
- Android: follow Material Design 3
- Minimum touch targets: 44x44 points
- Support dynamic type / font scaling
- Handle safe areas and notches
- Support dark mode and system themes
- Test on real devices, not just simulators

---
name: mobile-testing
description: Write and run mobile tests including widget tests, integration tests, and golden tests. Use when implementing test strategies for Flutter or React Native apps.
---

# Mobile Testing

Activate this skill when writing or running tests for mobile applications.

## When to Use

- Writing widget/component tests
- Implementing integration tests
- Setting up golden (snapshot) tests
- Testing navigation flows
- Mocking platform channels or native modules
- Testing offline behavior

## Flutter Testing

- Widget tests: `flutter test` with WidgetTester
- Integration tests: `flutter test integration_test/`
- Golden tests: `matchesGoldenFile` for visual regression
- Use `mockito` or `mocktail` for dependency mocking
- Use `bloc_test` for BLoC testing
- Test with different screen sizes using `binding.window`

## React Native Testing

- Unit tests: Jest with `@testing-library/react-native`
- Component tests: render and query by accessibility labels
- Integration tests: Detox for E2E
- Mock native modules in `jest.setup.js`
- Snapshot tests for visual regression

## Rules

- Test behavior, not implementation details
- Mock platform dependencies, not business logic
- Golden tests need baseline images committed to repo
- Integration tests should run on CI with emulators
- Cover critical user flows with integration tests
- Keep unit tests fast (under 1 second each)

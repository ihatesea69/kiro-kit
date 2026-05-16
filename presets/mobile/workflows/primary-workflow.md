# Primary Workflow

Follow this cycle for all implementation work: Plan, Implement, Test, Review.

## 1. Planning

- Analyze requirements and break into concrete tasks
- Research relevant packages and platform APIs before implementation
- Create implementation plan with TODO items
- Identify platform-specific considerations early

## 2. Implementation

- Write clean, readable, maintainable code
- Follow established architectural patterns (BLoC, clean architecture)
- Implement features according to specifications
- Handle edge cases and error scenarios
- After modifying code, run `flutter analyze` or typecheck to verify
- Test on both platforms during development

## 3. Testing

- Write widget tests for UI components
- Write unit tests for business logic
- Ensure high code coverage on critical paths
- Test error scenarios and edge cases
- Validate on both iOS and Android
- Do not use mocks or fake data just to pass tests

## 4. Review

- Review code for platform conventions compliance
- Check for performance anti-patterns
- Verify accessibility compliance
- Ensure documentation is updated
- Confirm no regressions on either platform

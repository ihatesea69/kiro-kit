# Code Standards

## Dart/Flutter

- Dart 3+ with sound null safety
- Follow effective Dart style guide
- Use `dart analyze` with zero warnings policy
- Format with `dart format` (line length 80)

## File Organization

```
lib/
  app/                   App config, themes, router
  core/                  Constants, extensions, utilities
  features/
    [feature]/
      data/              Repositories, data sources, DTOs
      domain/            Entities, use cases, interfaces
      presentation/
        screens/         Screen widgets
        widgets/         Feature widgets
        bloc/            State management
  shared/
    widgets/             Cross-feature reusable widgets
    services/            Shared services
test/
  features/[feature]/    Mirrors lib/ structure
```

## Naming

- Files: snake_case (`user_profile_screen.dart`)
- Classes: PascalCase (`UserProfileScreen`)
- Variables/functions: camelCase (`getUserProfile`)
- Constants: camelCase (`defaultPadding`) or UPPER_SNAKE_CASE (`API_BASE_URL`)
- BLoC events: PascalCase past tense (`ProfileLoaded`)
- BLoC states: PascalCase adjective (`ProfileLoading`)

## Widget Rules

- Prefer StatelessWidget with const constructors
- Keep build methods under 80 lines
- Extract sub-widgets into separate classes (not methods)
- Use named parameters for 3+ parameters
- Always include Key parameter

## State Management

- BLoC for complex features, Riverpod for simpler state
- Keep state immutable (freezed or sealed classes)
- Handle all async states: initial, loading, success, failure
- Dispose resources properly

## Error Handling

- Use typed error classes (sealed class hierarchy)
- Never catch generic Exception without rethrowing
- User-facing errors must be actionable
- Log errors to crash reporting in production

## Testing

- Widget tests colocated in test/ mirroring lib/
- Use `mocktail` for mocking
- Test behavior, not implementation
- Golden tests for visual regression

## Git Conventions

- Conventional commits: `type(scope): description`
- Branch naming: `feature/description`, `fix/description`
- PR titles under 72 characters
- Squash merge to main

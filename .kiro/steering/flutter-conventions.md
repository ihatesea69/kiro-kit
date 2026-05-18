---
inclusion: always
description: Flutter and Dart conventions for widget development, state management, and project structure.
---

# Flutter/Dart Conventions

## Project Structure

```
lib/
  app/                   App configuration, themes, routing
  core/                  Shared utilities, constants, extensions
  features/
    [feature]/
      data/              Repositories, data sources, models
      domain/            Entities, use cases, interfaces
      presentation/
        screens/         Screen widgets
        widgets/         Feature-specific widgets
        bloc/            BLoC/Cubit classes
  shared/
    widgets/             Reusable widgets across features
    services/            Shared services (auth, storage, network)
test/
  features/[feature]/    Mirror lib/ structure
  helpers/               Test utilities and mocks
```

## Dart Rules

- Sound null safety required (no `!` operator without justification)
- Use `const` constructors wherever possible
- Prefer `final` over `var` for local variables
- Use named parameters for widgets with more than 2 parameters
- Follow effective Dart style guide (snake_case files, PascalCase classes)

## Widget Patterns

- Prefer StatelessWidget; use StatefulWidget only when needed
- Keep build methods under 80 lines; extract sub-widgets
- Use `const` keyword on widget constructors and instances
- Accept callbacks (VoidCallback, ValueChanged) for interactions
- Use Key parameter for list items and animated widgets

## State Management

- BLoC for complex features with multiple events
- Riverpod for dependency injection and simple state
- Keep state immutable (use freezed or sealed classes)
- Handle all async states: initial, loading, success, failure

## Naming Conventions

- Files: snake_case (`user_profile_screen.dart`)
- Classes: PascalCase (`UserProfileScreen`)
- Variables/functions: camelCase (`getUserProfile`)
- Constants: camelCase or UPPER_SNAKE_CASE for top-level
- BLoC events: PascalCase past tense (`UserProfileLoaded`)
- BLoC states: PascalCase adjective (`UserProfileLoading`)

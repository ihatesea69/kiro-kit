---
description: Generate a new mobile screen with proper architecture layers
inclusion: manual
argument-hint: "[screen-name] [framework]"
---

## Arguments
NAME: $1 (required, PascalCase screen name)
FRAMEWORK: $2 (default: flutter, options: flutter, react-native)

## Workflow

### Flutter
1. Create screen widget at `lib/features/$1/presentation/screens/`
2. Generate BLoC/Cubit for screen state management
3. Create screen-specific widgets in `widgets/` subdirectory
4. Add route registration in router configuration
5. Create widget test file
6. Run `flutter analyze` to verify

### React Native
1. Create screen component at `src/screens/$1/`
2. Generate screen with TypeScript props interface
3. Add navigation type definitions
4. Register in navigation stack
5. Create test file
6. Run typecheck to verify

## Output Structure (Flutter)
```
lib/features/[name]/
  presentation/
    screens/[name]_screen.dart
    widgets/
  domain/
  data/
test/features/[name]/
  [name]_screen_test.dart
```

## Conventions
- Screens handle layout and composition only
- Business logic lives in BLoC/Cubit (Flutter) or hooks (RN)
- Each screen has a corresponding test file
- Navigation registration is required
- Handle all states: loading, error, empty, data

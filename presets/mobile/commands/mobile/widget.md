---
description: Generate a reusable widget or component with tests
inclusion: manual
argument-hint: "[widget-name] [framework]"
---

## Arguments
NAME: $1 (required, PascalCase widget name)
FRAMEWORK: $2 (default: flutter, options: flutter, react-native)

## Workflow

### Flutter
1. Create widget file at appropriate location
2. Use const constructor and proper Key parameter
3. Define typed parameters with documentation
4. Implement proper theming support (Theme.of)
5. Create widget test with key interactions
6. Run `flutter analyze` to verify

### React Native
1. Create component file with TypeScript interface
2. Implement with proper accessibility props
3. Support platform-adaptive rendering if needed
4. Create test file with React Testing Library
5. Run typecheck to verify

## Output Structure (Flutter)
```
lib/shared/widgets/
  [name].dart              Widget implementation
test/shared/widgets/
  [name]_test.dart         Widget tests
```

## Conventions
- Prefer StatelessWidget with const constructor
- Accept callbacks for user interactions (not internal navigation)
- Support theming via Theme.of(context)
- Include semantic labels for accessibility
- Keep under 100 lines; extract sub-widgets if larger
- Document public parameters with /// comments

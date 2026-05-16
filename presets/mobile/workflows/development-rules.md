# Development Rules

Follow these principles: YAGNI (You Aren't Gonna Need It), KISS (Keep It Simple, Stupid), DRY (Don't Repeat Yourself).

## General

- Use kebab-case for file names (Dart: snake_case per convention)
- Keep individual code files under 200 lines
- Split large widgets into smaller, focused sub-widgets
- Use composition over inheritance
- Extract business logic into separate service/repository classes
- Separate UI from business logic (presentation vs domain layers)

## Code Quality

- Prioritize functionality and readability over strict style enforcement
- Use try-catch error handling and cover security standards
- No syntax errors -- code must compile at all times
- Follow the codebase structure and code standards in `docs/`
- Run `flutter analyze` or `eslint` before considering work complete

## Pre-commit Rules

- Run analyzer/linter before commit
- Run tests before push
- Keep commits focused on actual code changes
- Do NOT commit confidential information (dotenv files, API keys, keystores)
- Use conventional commit format

## Implementation

- Write clean, readable, maintainable code
- Follow established architectural patterns
- Handle edge cases and error scenarios
- Do NOT create new enhanced files -- update existing files directly
- Consider both platforms when making changes to shared code

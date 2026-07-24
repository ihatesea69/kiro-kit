# Development Rules

Follow these principles: YAGNI (You Aren't Gonna Need It), KISS (Keep It Simple, Stupid), DRY (Don't Repeat Yourself).

## General

- Use kebab-case for file names with meaningful descriptive names
- Keep individual code files under 200 lines
- Split large files into smaller, focused components/modules
- Use composition over inheritance for complex components
- Extract utility functions into separate modules
- Create dedicated service classes for business logic

## Code Quality

- Prioritize functionality and readability over strict style enforcement
- Use try-catch error handling and cover security standards
- No syntax errors -- code must be compilable at all times
- Follow the codebase structure and code standards in `docs/`

## Pre-commit Rules

- Run linting before commit
- Run tests before push
- Keep commits focused on actual code changes
- Do NOT commit confidential information (dotenv files, API keys, credentials)
- Use conventional commit format

## Implementation

- Write clean, readable, maintainable code
- Follow established architectural patterns
- Handle edge cases and error scenarios
- Do NOT create new enhanced files -- update existing files directly

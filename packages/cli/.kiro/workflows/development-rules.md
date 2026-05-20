# Development Rules

Follow these principles in all implementation work: YAGNI (You Aren't Gonna Need It), KISS (Keep It Simple, Stupid), DRY (Don't Repeat Yourself).

## File Naming

- Use kebab-case for all file names
- Names should describe purpose clearly without needing to read content
- Long descriptive names are preferred over short ambiguous ones

## File Size Management

- Keep individual code files under 200 lines
- Split large files into smaller, focused modules
- Use composition over inheritance for complex components
- Extract utility functions into separate modules
- Create dedicated service classes for business logic

## Code Quality

- Write clean, readable, maintainable code
- Follow established architectural patterns in the project
- Handle edge cases and error scenarios with try-catch
- Use secure coding patterns by default
- Do not create new "enhanced" files; update existing files directly

## Pre-commit Rules

- Run linting before commit
- Run tests before push
- Keep commits focused on actual code changes
- Never commit confidential information (dotenv, API keys, credentials)
- Use conventional commit format

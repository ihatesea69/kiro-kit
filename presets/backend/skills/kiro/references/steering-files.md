# Steering Files

## Overview

Steering files provide additional context and instructions to the AI agent. They live in `.kiro/steering/` and influence all interactions.

## Inclusion Modes

### Always Included (default)
```markdown
---
inclusion: always
description: Project coding standards
---

Your instructions here...
```

### Conditional (fileMatch)
Only included when matching files are read into context:
```markdown
---
inclusion: fileMatch
fileMatchPattern: "*.test.ts"
description: Testing conventions
---

Your testing instructions here...
```

### Manual
Only included when user explicitly references via `#` in chat:
```markdown
---
inclusion: manual
description: Database migration guide
---

Your migration guide here...
```

## Front-Matter Schema

Required fields:
- `inclusion`: "always" | "fileMatch" | "manual"
- `description`: Brief description of the steering file

Optional fields:
- `fileMatchPattern`: Glob pattern (required for fileMatch inclusion)

## Best Practices

- Keep steering files focused on one topic
- Use "always" sparingly to avoid context bloat
- Use "fileMatch" for language/framework-specific conventions
- Use "manual" for reference material not needed every time
- Include file references with `#[[file:relative/path]]` syntax

## Examples

### Code Standards
```markdown
---
inclusion: always
description: TypeScript coding standards
---

- Use strict mode, no `any` types
- Prefer interfaces for props, types for unions
- Use Zod for runtime validation
```

### API Conventions (conditional)
```markdown
---
inclusion: fileMatch
fileMatchPattern: "**/api/**/*.ts"
description: API route conventions
---

- Use parameterized queries
- Validate input with Zod
- Return consistent error format
```

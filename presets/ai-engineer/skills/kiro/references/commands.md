# Commands

## Overview

Commands are user-defined operations in `.kiro/commands/` that expand to prompts. They provide shortcuts for common workflows.

## File Format

```markdown
---
description: Brief description of what this command does
inclusion: manual
argument-hint: "[pattern]"
---

## Arguments
PATTERN: $1 (default: all)

## Workflow
1. Step one
2. Step two
3. Step three
```

## Front-Matter

Required fields:
- `description`: What the command does

Optional fields:
- `inclusion`: "manual" (default)
- `argument-hint`: Hint for arguments shown to user

## Arguments

Use `$1`, `$2`, etc. for positional arguments passed by the user.

## Nested Commands

Commands can be organized in subdirectories:
```
.kiro/commands/
  test.md
  fix/
    types.md
    test.md
    fast.md
  git/
    cm.md
    cp.md
    pr.md
```

Access nested commands with colon notation: `/fix:types`, `/git:cm`

## Best Practices

- Keep commands focused on one workflow
- Include clear step-by-step instructions
- Use argument hints to guide users
- Document default behavior when no arguments provided

# Installing New Skills

## Quick Start

1. Create a new folder under `skills/` with a kebab-case name
2. Add a `SKILL.md` file with required front-matter
3. Optionally add `references/`, `scripts/`, `assets/` folders

## SKILL.md Front-matter

Required fields:

```yaml
---
name: my-skill-name
description: When and why this skill should be activated
---
```

## File Organization

- `SKILL.md` - Main skill definition (required)
- `references/` - Documentation, API specs, guides the skill references
- `scripts/` - Executable scripts (bash, node, python)
- `assets/` - Static files (images, templates, configs)

## Best Practices

- Keep SKILL.md concise and focused on activation criteria
- Use progressive disclosure: put details in reference files
- Name the skill folder to match its `name` front-matter field
- Test that the skill activates correctly for its intended triggers
- Document any environment variables in `skills/.env.example`

## Removing Skills

Delete the skill folder. No other cleanup is needed.

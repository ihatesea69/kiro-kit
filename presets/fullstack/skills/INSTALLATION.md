# Installing New Skills

## Adding a Skill

1. Create a new directory under `.kiro/skills/<skill-name>/`
2. Add a `SKILL.md` file with required front-matter:

```yaml
---
name: my-skill
description: Brief description of when to activate this skill
---
```

3. Add content describing the skill's capabilities and usage
4. Optionally add `references/`, `scripts/`, `assets/` subdirectories

## Front-matter Requirements

- `name`: kebab-case identifier (required)
- `description`: When to activate this skill (required)

## Best Practices

- Keep `SKILL.md` concise (token-efficient)
- Put detailed documentation in `references/` for progressive disclosure
- Use `scripts/` for automation that the skill provides
- Test that the skill activates correctly in Kiro

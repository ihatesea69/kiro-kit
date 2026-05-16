# Installing Skills

## Adding a New Skill

1. Create a directory under `.kiro/skills/` with the skill name (kebab-case)
2. Create a `SKILL.md` file with YAML front-matter:

```markdown
---
name: my-skill
description: When to activate and what it provides.
---

# My Skill

Instructions and knowledge here.
```

3. Optionally add subdirectories:
   - `references/` - Additional documentation
   - `scripts/` - Executable scripts
   - `assets/` - Static files

## Front-matter Requirements

- `name` (required): kebab-case identifier
- `description` (required): activation triggers and capabilities

## Best Practices

- Keep SKILL.md concise (under 200 lines)
- Use progressive disclosure (details in references/)
- Include practical examples over abstract theory
- State clear activation triggers in description

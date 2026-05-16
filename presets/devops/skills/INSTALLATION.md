# Skill Installation Guide

## Adding a New Skill

1. Create a directory under `.kiro/skills/` with a kebab-case name
2. Add a `SKILL.md` file with YAML front-matter:

```yaml
---
name: my-skill-name
description: Brief description of when to use this skill
---
```

3. Write the skill body with sections: When to Use, Process, Rules
4. Optionally add `references/`, `scripts/`, `assets/` directories

## Skill Front-matter Requirements

- `name` (required): kebab-case identifier
- `description` (required): one-sentence description of when to activate

## Best Practices

- Keep SKILL.md under 100 lines for token efficiency
- Use `references/` for detailed documentation
- Include clear activation criteria in "When to Use"
- Define explicit, actionable rules
- Test the skill with representative scenarios

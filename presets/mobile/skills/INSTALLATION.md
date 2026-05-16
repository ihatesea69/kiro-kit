# Installing Skills

## Adding a New Skill

1. Create a directory under `.kiro/skills/` with a kebab-case name
2. Add a `SKILL.md` file with required front-matter:

```yaml
---
name: your-skill-name
description: When to activate this skill
---
```

3. Add content describing when to use, guidelines, and rules
4. Optionally add `references/`, `scripts/`, `assets/` subdirectories

## Skill Discovery

Skills are discovered by the presence of `SKILL.md` in a directory under `.kiro/skills/`.

## Sub-skill Containers

For related skills, create a parent directory with sub-directories each containing their own `SKILL.md`. The parent directory does not need a `SKILL.md`.

## Third-Party Skills

Document any third-party skills in `THIRD_PARTY_NOTICES.md` with attribution and license information.

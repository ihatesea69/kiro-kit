# Installing Skills

## Adding a New Skill

1. Create a directory under `.kiro/skills/` with a kebab-case name
2. Add a `SKILL.md` file with YAML front-matter (name, description)
3. Optionally add `references/`, `scripts/`, `assets/` directories
4. Keep `SKILL.md` concise (under 100 lines) for token efficiency
5. Put detailed documentation in `references/` for progressive disclosure

## SKILL.md Template

```markdown
---
name: my-skill
description: One sentence describing when to activate this skill.
---

# My Skill

Brief overview.

## When to Use
- Trigger condition 1
- Trigger condition 2

## Process
1. Step one
2. Step two

## Rules
- Constraint or guideline
```

## Sub-skill Containers

For related skills that share a domain, create a container directory without a root SKILL.md:

```
skills/container-name/
  sub-skill-1/SKILL.md
  sub-skill-2/SKILL.md
```

## Third-Party Skills

See `THIRD_PARTY_NOTICES.md` for attribution requirements when using third-party skill content.

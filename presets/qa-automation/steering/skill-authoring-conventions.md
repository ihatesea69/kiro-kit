---
inclusion: manual
description: Conventions for creating and organizing skills including folder structure, SKILL.md format, and reference documentation.
---

# Skill Authoring Conventions

## Folder Structure

```
skills/
  skill-name/
    SKILL.md           - Required: skill metadata and overview
    references/        - Required: reference documentation
      topic-name.md    - One or more reference files
    scripts/           - Optional: automation scripts
    templates/         - Optional: code templates
```

## SKILL.md Format

```markdown
---
name: skill-name-in-kebab-case
description: Clear description of what this skill covers and when to use it.
---

# Skill Title

Brief overview of the skill.

## When to Use This Skill

- Bullet list of activation triggers
```

## Frontmatter Rules

- `name`: lowercase-kebab-case, matches folder name
- `description`: comprehensive description including activation keywords
- No other fields in frontmatter

## Reference Files

- One topic per reference file
- Use descriptive file names (kebab-case)
- Include code examples where applicable
- Keep content focused and actionable
- No emoji in content

## Best Practices

- Skills should be self-contained
- Reference material should be complete enough to guide an agent
- Include both conceptual guidance and practical examples
- Update references when frameworks release new versions

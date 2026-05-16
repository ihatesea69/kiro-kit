---
name: skill-creator
description: Guide for creating effective agent skills with proper structure, front-matter, and progressive disclosure. Use when creating or updating skills.
---

# Skill Creator

Activate this skill when creating or updating agent skills.

## When to Use

- Creating a new skill from scratch
- Updating an existing skill with new content
- Optimizing a skill for token efficiency
- Structuring skill references and scripts

## Skill Structure

```
skills/[skill-name]/
  SKILL.md              Main skill file (front-matter + instructions)
  references/           Additional documentation files
  scripts/              Executable scripts for the skill
  assets/               Static assets (images, configs)
```

## SKILL.md Format

```markdown
---
name: skill-name
description: When to activate and what it provides.
---

# Skill Name

Brief overview.

## When to Use
Activation scenarios.

## Instructions
Core knowledge and workflows.

## References
Pointers to reference files.
```

## Rules

- Keep SKILL.md concise for token efficiency
- Use progressive disclosure (overview in SKILL.md, details in references)
- Front-matter must have `name` and `description`
- Description should clearly state activation triggers
- Include practical examples over abstract theory

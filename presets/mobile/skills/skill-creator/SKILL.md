---
name: skill-creator
description: Guide for creating effective skills that extend capabilities with specialized knowledge, workflows, or tool integrations. Use when building new skills.
---

# Skill Creator

Activate this skill when creating or updating skills.

## When to Use

- Creating a new skill for specialized knowledge
- Updating an existing skill with new capabilities
- Structuring skill documentation for optimal use
- Adding reference files or scripts to skills

## Skill Structure

```
skills/<skill-name>/
  SKILL.md              Main skill file with front-matter
  references/           Reference documentation
  scripts/              Executable scripts
  assets/               Static assets
```

## SKILL.md Requirements

- Front-matter: `name` (kebab-case) and `description` (when to activate)
- Clear "When to Use" section
- Concise guidelines and rules
- Token-efficient (progressive disclosure)

## Rules

- Keep SKILL.md under 100 lines for token efficiency
- Use references/ for detailed documentation
- Description must clearly state activation triggers
- Name must be kebab-case
- Avoid duplicating information available elsewhere

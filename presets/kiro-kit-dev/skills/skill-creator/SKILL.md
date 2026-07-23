---
name: skill-creator
description: >-
  Guide for creating effective skills that extend agent capabilities with
  specialized knowledge and workflows. Use when building new skills.
license: Complete terms in LICENSE.txt
---

# Skill Creator

Activate this skill when creating or updating agent skills.

## When to Use

- Creating a new skill for specialized knowledge
- Updating an existing skill with new capabilities
- Organizing skill content for progressive disclosure
- Adding reference files or scripts to a skill

## Skill Structure

```
skills/skill-name/
  SKILL.md           Main skill file (concise, token-efficient)
  references/        Detailed documentation (loaded on demand)
  scripts/           Executable scripts for the skill
  assets/            Static assets (templates, configs)
  tests/             Skill-specific tests
```

## SKILL.md Format

```markdown
---
name: skill-name
description: When to activate this skill (one sentence)
---

# Skill Name

Brief overview (2-3 sentences).

## When to Use
[Bullet list of activation triggers]

## Process
[Numbered steps for using the skill]

## Rules
[Key constraints and guidelines]
```

## Rules

- Keep SKILL.md under 100 lines for token efficiency
- Put detailed content in references/ directory
- Use progressive disclosure: summary in SKILL.md, details in references
- Include clear activation triggers in description
- Test skills with representative scenarios

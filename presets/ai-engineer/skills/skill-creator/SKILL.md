---
name: skill-creator
description: >-
  Guide for creating effective agent skills. Use when building new skills to
  extend agent capabilities with specialized knowledge.
license: Complete terms in LICENSE.txt
---

# Skill Creator

Activate this skill when creating new skills for the ai-engineer agent ecosystem.

## When to Use

- Creating a new domain-specific skill
- Updating an existing skill with new capabilities
- Structuring skill knowledge for optimal retrieval
- Designing skill activation triggers

## Skill Structure

```
skills/[skill-name]/
  SKILL.md           Required: front-matter + instructions
  references/        Optional: additional documentation
  scripts/           Optional: executable helper scripts
  assets/            Optional: static files, templates
```

## SKILL.md Template

```markdown
---
name: skill-name
description: When to activate and what it provides.
---

# Skill Name

## When to Use
- Trigger condition 1
- Trigger condition 2

## Instructions
[Domain knowledge and procedures]

## Rules
- Constraint 1
- Constraint 2
```

## Rules

- Keep SKILL.md under 200 lines
- Description must clearly state activation triggers
- Use progressive disclosure (details in references/)
- Include practical examples over abstract theory
- Test skill activation with sample prompts


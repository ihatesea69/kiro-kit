---
name: skill-creator
description: >-
  Guide for creating effective skills that extend agent capabilities with
  specialized knowledge, workflows, or tool integrations.
license: Complete terms in LICENSE.txt
---

# Skill Creator

Activate this skill when creating or updating agent skills.

## When to Use

- Creating a new skill for specialized knowledge
- Updating an existing skill with new capabilities
- Designing skill structure for progressive disclosure
- Integrating external tools into a skill workflow

## Structure

```
skills/<skill-name>/
  SKILL.md          Main skill file (concise, token-efficient)
  references/       Detailed documentation (loaded on demand)
  scripts/          Automation scripts
  assets/           Static assets
  tests/            Skill validation tests
```

## Rules

- SKILL.md should be under 100 lines for token efficiency
- Use references/ for detailed documentation
- Include clear "When to Use" section
- Define explicit process steps
- Keep rules actionable and specific
- Test skills before publishing

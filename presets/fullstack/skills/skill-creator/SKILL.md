---
name: skill-creator
description: >-
  Guide for creating effective agent skills. Use when users want to create or
  update skills that extend agent capabilities.
license: Complete terms in LICENSE.txt
---

# Skill Creator

Activate when creating or updating skills for the Kiro agent system.

## Skill Structure

```
skills/<skill-name>/
  SKILL.md              Required. Front-matter + instructions.
  references/           Optional. Detailed docs.
  scripts/              Optional. Automation scripts.
  assets/               Optional. Static files.
```

## SKILL.md Requirements

```yaml
---
name: skill-name        # kebab-case, required
description: When to use # required
---
```

## Best Practices

- Keep SKILL.md concise (under 100 lines ideal)
- Use progressive disclosure: overview in SKILL.md, details in references/
- Write clear "When to Use" section for agent activation
- Include practical examples and patterns
- Avoid duplicating information available in official docs
- Focus on decision-making guidance over reference material

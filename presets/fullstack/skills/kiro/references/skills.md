# Skills

## Overview

Skills are modular capabilities that Kiro activates automatically based on context. They provide specialized knowledge and workflows.

## Structure

```
.kiro/skills/{skill-name}/
  skill.md            # Main skill file (required)
  references/         # Supporting documents (optional)
    guide.md
    examples.md
```

## skill.md Format

```markdown
---
name: my-skill
description: >-
  When to activate this skill. Include trigger phrases
  and use cases.
---

# Skill Title

Content, instructions, and guidance...

## References

- `references/guide.md` - Detailed guide
```

## Front-Matter

Required fields:
- `name`: Skill identifier (kebab-case)
- `description`: Activation description (when should Kiro use this skill)

## Activation

Skills activate automatically when:
- User's message matches the description keywords
- Context suggests the skill is relevant
- User explicitly references the skill

## Best Practices

- Keep descriptions specific about when to activate
- Use references for detailed content (keeps main file focused)
- One skill per domain/topic
- Include examples in the skill content
- Reference external docs when available

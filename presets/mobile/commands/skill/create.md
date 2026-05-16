---
description: Create a new skill from scratch with proper structure
inclusion: manual
argument-hint: "[skill-name] [description]"
---

## Arguments
NAME: $1 (required, kebab-case skill name)
DESC: $2 (required, when to activate this skill)

## Workflow
1. Create directory `.kiro/skills/$1/`
2. Generate SKILL.md with front-matter and template content
3. Create optional subdirectories (references/, scripts/, assets/)
4. Populate with initial guidelines based on description
5. Verify structure matches skill specification

---
description: Create a new skill from template
inclusion: manual
argument-hint: "[skill-name] [description]"
---

## Arguments
NAME: $1 (required, kebab-case)
DESCRIPTION: $2 (required)

## Workflow
1. Copy template-skill directory to `.kiro/skills/$1`
2. Update SKILL.md front-matter with name and description
3. Customize content based on description
4. Create references/ directory if needed
5. Verify skill structure is valid

---
description: Create a new skill from scratch
inclusion: manual
argument-hint: "[skill-name] [description]"
---

## Arguments
NAME: $1 (required)
DESCRIPTION: $2 (required)

## Workflow
1. Create skill directory at `.kiro/skills/$1`
2. Generate SKILL.md with front-matter and instructions
3. Create `references/`, `scripts/`, `assets/` subdirectories
4. Add initial reference content if applicable
5. Report created skill structure

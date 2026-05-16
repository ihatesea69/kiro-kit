---
description: Create a new skill from scratch
inclusion: manual
argument-hint: "[skill-name] [description]"
---

## Arguments
NAME: $1 (required)
DESCRIPTION: $2 (required)

## Workflow
1. Create directory at `.kiro/skills/$1`
2. Generate SKILL.md with front-matter and content
3. Create references/ directory if detailed docs needed
4. Verify skill structure is valid
5. Report created files

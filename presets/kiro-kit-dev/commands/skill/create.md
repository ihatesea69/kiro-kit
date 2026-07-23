---
description: Create a new skill from scratch
inclusion: manual
argument-hint: "[skill-name] [description]"
---

## Arguments
NAME: $1 (required, kebab-case skill name)
DESCRIPTION: $2 (required, what the skill does)

## Workflow
1. Create skill directory at `.kiro/skills/$1/`
2. Generate SKILL.md with front-matter and content
3. Create references/ directory if detailed docs needed
4. Create scripts/ directory if automation needed
5. Verify skill structure matches specification
6. Test activation with representative scenario

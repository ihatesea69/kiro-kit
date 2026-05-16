---
description: Add a new skill or reference files to an existing skill
inclusion: manual
argument-hint: "[skill-name] [prompt]"
---

## Arguments
SKILL: $1 (required, skill name in kebab-case)
PROMPT: $2 (required, what to add)

## Workflow
1. Locate or create skill directory at `.kiro/skills/$1/`
2. Analyze requirements from prompt
3. Create or update SKILL.md with proper front-matter
4. Add reference files if documentation is provided
5. Verify skill structure is valid

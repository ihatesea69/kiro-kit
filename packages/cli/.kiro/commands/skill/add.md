---
description: Add new reference files or scripts to a skill
inclusion: manual
argument-hint: "[skill-name] [reference-or-script-prompt]"
---

## Arguments
SKILL: $1 (required, skill name)
PROMPT: $2 (required, what to add)

## Workflow
1. Locate skill directory at `.kiro/skills/$1`
2. Analyze existing skill content
3. Create new reference files or scripts based on prompt
4. Update SKILL.md if activation triggers change
5. Verify skill structure is valid

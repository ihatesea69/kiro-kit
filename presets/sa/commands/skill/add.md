---
description: Add new reference files or scripts to a skill
inclusion: manual
argument-hint: "[skill-name] [reference-prompt]"
---

## Arguments
SKILL: $1 (required)
PROMPT: $2 (required)

## Workflow
1. Locate skill directory at `.kiro/skills/$1`
2. Analyze requirements from prompt
3. Create reference files or scripts as needed
4. Update SKILL.md if new capabilities added
5. Verify skill structure is valid

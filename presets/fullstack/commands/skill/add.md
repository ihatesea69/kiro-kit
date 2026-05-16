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
2. Analyze the reference or script requirements
3. Create appropriate files in the skill directory
4. Update SKILL.md if needed
5. Report added files

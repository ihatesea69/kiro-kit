---
description: Add a new skill to the agent ecosystem
inclusion: manual
argument-hint: "[skill-name] [reference-or-script-prompt]"
---

## Arguments
NAME: $1 (required, skill name in kebab-case)
PROMPT: $2 (required, description of skill content)

## Workflow
1. Create skill directory at `skills/$NAME/`
2. Generate SKILL.md with front-matter and instructions
3. Add references/ directory if documentation is extensive
4. Verify front-matter has required fields (name, description)
5. Update skills/README.md with new entry


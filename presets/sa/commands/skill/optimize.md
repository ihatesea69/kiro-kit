---
description: Optimize an existing agent skill
inclusion: manual
argument-hint: "[skill-name] [prompt]"
---

## Arguments
SKILL: $1 (required)
PROMPT: $2 (default: empty)

## Workflow
1. Read current skill at `.kiro/skills/$1`
2. Analyze for improvement opportunities
3. Propose optimization plan
4. Ask user to review before implementing
5. Apply approved changes

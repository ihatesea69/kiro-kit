# Agent Skills Specification

## Overview

Skills (Powers) extend agent capabilities with specialized knowledge and workflows. Each skill is a self-contained unit that can be activated on demand.

## Activation

Skills are activated by name reference. When activated, the agent reads the `SKILL.md` file and follows its instructions.

## Progressive Disclosure

- `SKILL.md`: concise overview and rules (always loaded)
- `references/`: detailed documentation (loaded on demand)
- `scripts/`: automation scripts (executed when needed)

## Naming Convention

- Directory: kebab-case (`container-security`)
- SKILL.md: always uppercase filename
- References: descriptive kebab-case filenames

## Quality Requirements

- SKILL.md must have valid YAML front-matter with `name` and `description`
- Content must be actionable and specific to the skill domain
- Rules must be verifiable and enforceable
- Process steps must be sequential and clear

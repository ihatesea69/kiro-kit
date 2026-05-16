# Agent Skills Specification

## Overview

Skills are modular knowledge packages that extend agent capabilities. Each skill provides domain-specific instructions, reference material, and optional scripts.

## Skill Structure

A valid skill must contain:
- `SKILL.md` with YAML front-matter (`name`, `description`)
- Optional `references/` directory for documentation
- Optional `scripts/` directory for executable tools
- Optional `assets/` directory for static resources

## Front-matter Schema

```yaml
---
name: string        # kebab-case identifier (required)
description: string # activation criteria description (required)
---
```

## Activation

Skills activate when the agent determines the current task matches the skill description. The description field should clearly state when the skill is relevant.

## Progressive Disclosure

Keep `SKILL.md` body concise. Place detailed documentation in `references/` to minimize token consumption when the skill is loaded.

## Sub-skill Containers

A directory without a root `SKILL.md` that contains sub-directories each with their own `SKILL.md` is a sub-skill container. Each sub-skill activates independently.

## Naming Conventions

- Folder name: kebab-case matching the `name` field
- SKILL.md: uppercase filename (required for discovery)
- Reference files: descriptive kebab-case names
- Scripts: kebab-case with appropriate extension

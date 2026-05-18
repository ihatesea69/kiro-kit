# Agent Skills Specification

## Overview

Skills are specialized knowledge modules that agents activate on demand. They follow a progressive disclosure pattern: the SKILL.md file provides a concise overview, while detailed content lives in the references/ directory.

## Activation

Agents activate skills by reading the SKILL.md file when the task matches the skill's description. The description field in front-matter serves as the activation trigger.

## Front-matter Schema

```yaml
---
name: skill-name          # kebab-case identifier
description: When to use  # activation trigger (one sentence)
---
```

## Directory Structure

```
skills/skill-name/
  SKILL.md              # Required: main skill file
  references/           # Optional: detailed docs
  scripts/              # Optional: executable scripts
  assets/               # Optional: templates, configs
  tests/                # Optional: skill tests
```

## Token Efficiency

- SKILL.md should be under 100 lines
- Use references/ for detailed content
- Only load what is needed for the current task
- Prefer bullet points over prose for guidelines

## Sub-skill Containers

A directory without SKILL.md at root but with sub-directories containing SKILL.md files is a sub-skill container. Each sub-skill is independently activatable.

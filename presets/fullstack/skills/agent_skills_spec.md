# Agent Skills Specification

## Overview

Skills extend agent capabilities with specialized knowledge. They follow progressive disclosure: `SKILL.md` provides a concise overview, while `references/` contains detailed documentation loaded only when needed.

## Activation

Agents activate skills by reading the `SKILL.md` file. The front-matter `name` and `description` fields help agents decide when to activate.

## Directory Structure

```
skills/<skill-name>/
  SKILL.md              Required. Front-matter + concise instructions.
  references/           Optional. Detailed docs loaded on demand.
  scripts/              Optional. Automation scripts.
  assets/               Optional. Static files.
```

## Front-matter Schema

```yaml
---
name: skill-name        # kebab-case, required
description: When to use # required, helps agent decide activation
---
```

## Sub-skill Containers

A skill directory without its own `SKILL.md` but containing subdirectories with `SKILL.md` files is a sub-skill container. Example:

```
skills/document-skills/
  docx/SKILL.md
  pdf/SKILL.md
  xlsx/SKILL.md
```

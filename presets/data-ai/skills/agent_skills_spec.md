# Agent Skills Specification

## Overview

Skills provide specialized knowledge and workflows to agents. Each skill is a self-contained folder with a `SKILL.md` file that defines activation triggers and instructions.

## Structure

```
skills/
  [skill-name]/
    SKILL.md           Required: front-matter + instructions
    references/        Optional: additional docs
    scripts/           Optional: executable scripts
    assets/            Optional: static files
```

## Sub-Skill Containers

Some skills are containers for related sub-skills (e.g., `document-skills/`). These do NOT have a root `SKILL.md` but contain sub-folders that each have their own `SKILL.md`.

```
document-skills/
  docx/
    SKILL.md
  pdf/
    SKILL.md
  pptx/
    SKILL.md
  xlsx/
    SKILL.md
```

## Front-matter Schema

```yaml
---
name: skill-name          # Required: kebab-case identifier
description: ...          # Required: when to activate + capabilities
---
```

## Activation

Skills are activated by name when their description matches the current task context. The agent reads the SKILL.md content to gain specialized knowledge for the task.


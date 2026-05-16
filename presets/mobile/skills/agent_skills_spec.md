# Agent Skills Specification

## Overview

Skills provide specialized knowledge and workflows that agents can activate on demand. They follow a progressive disclosure pattern to minimize token consumption while providing deep expertise when needed.

## File Structure

```
skills/<name>/
  SKILL.md          Required. Front-matter + guidelines.
  references/       Optional. Detailed reference docs.
  scripts/          Optional. Executable automation scripts.
  assets/           Optional. Static files (templates, configs).
```

## Front-Matter Schema

```yaml
---
name: kebab-case-name        # Required
description: activation text  # Required. Describes WHEN to use.
---
```

## Activation

Skills are activated by name when their domain matches the current task. The description field determines when activation is appropriate.

## Guidelines for Writing Skills

- Keep SKILL.md concise (under 100 lines ideal)
- Put detailed documentation in references/
- Description should clearly state activation triggers
- Include "When to Use" section with bullet points
- Include "Rules" section with constraints
- Avoid duplicating information available in other skills

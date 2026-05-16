# Agent Skills Specification

## Overview

Skills extend agent capabilities with specialized knowledge, workflows, and tool integrations. Each skill is self-contained in a directory with a `SKILL.md` entry point.

## Structure

```
skills/
  [skill-name]/
    SKILL.md           Entry point (required)
    references/        Additional docs (optional)
    scripts/           Executable scripts (optional)
    assets/            Static files (optional)
```

## SKILL.md Requirements

- YAML front-matter with `name` and `description`
- Body contains instructions, patterns, and examples
- Should be under 200 lines for token efficiency
- Use progressive disclosure for complex topics

## Activation

Skills are activated when:
- User request matches the skill description keywords
- Agent determines the skill is relevant to the task
- User explicitly requests a skill by name

## Quality Standards

- Clear activation triggers in description
- Practical examples over abstract theory
- Token-efficient content structure
- No external dependencies required for core functionality

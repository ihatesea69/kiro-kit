---
inclusion: manual
description: Conventions for creating and maintaining AI agent definitions including structure, naming, and behavioral guidelines.
---

# Agent Authoring Conventions

## File Structure

Each agent is a single Markdown file with YAML frontmatter:

```markdown
---
name: agent-name-in-kebab-case
description: Clear, concise description of when to activate this agent.
---

Agent body content describing role, responsibilities, process, and quality standards.
```

## Frontmatter Rules

- `name`: lowercase-kebab-case identifier
- `description`: one sentence describing the agent's specialization and activation trigger
- No other fields in frontmatter (no tools, model, handoffs, version, category)

## Body Structure

1. Introduction paragraph defining the agent's role
2. Responsibilities section (what the agent does)
3. Process section (step-by-step workflow)
4. Quality Standards section (constraints and rules)

## Naming Conventions

- File name matches the `name` field plus .md extension
- Use descriptive, role-based names
- Avoid generic names like "helper" or "assistant"

## Writing Style

- Be direct and specific
- Use imperative mood for instructions
- Avoid jargon unless domain-specific
- No emoji in any content
- Keep descriptions actionable

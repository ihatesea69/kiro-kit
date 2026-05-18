---
name: kiro
description: >-
  Use when users ask about Kiro IDE features, setup, configuration,
  troubleshooting, specs, steering files, MCP servers, hooks, skills,
  commands, or workspace management. Activate for questions like 'How
  do I use Kiro?', 'What are specs?', 'How to set up MCP?', 'Create a
  steering file', 'Fix Kiro issues', or 'Configure my workspace'.
---

# Kiro IDE Expert

Kiro is an AI-powered development environment that helps developers focus on what matters: designing systems, exploring solutions, and making decisions. It combines autonomous planning, execution, and validation with extensibility through specs, steering files, skills, commands, hooks, and MCP servers.

## When to Use This Skill

Use when users need help with:
- Understanding Kiro features and capabilities
- Installation, setup, and workspace configuration
- Creating and managing specs (requirements, design, tasks)
- Writing steering files for project conventions
- Creating or managing skills
- Configuring MCP servers for external tool integration
- Setting up hooks for automation
- Using commands for development workflows
- Troubleshooting Kiro issues
- Multi-workspace and team collaboration
- Advanced features (autonomy modes, context management)

**Activation examples:**
- "How do I use Kiro?"
- "What are specs and how do I create one?"
- "How to set up MCP servers?"
- "Create a new steering file for X"
- "Fix Kiro configuration issues"
- "How do hooks work in Kiro?"

## Core Architecture

**Specs**: Structured feature development workflow (requirements -> design -> tasks) that guides implementation systematically

**Steering Files**: Project-level instructions in `.kiro/steering/` that provide conventions, standards, and context to the AI agent

**Skills**: Modular capabilities with instructions and references that Kiro activates automatically based on context

**Commands**: User-defined operations in `.kiro/commands/` that expand to prompts for common workflows

**Hooks**: Automated actions triggered by IDE events (file changes, tool use, task execution, prompt submission)

**MCP Servers**: Model Context Protocol integrations connecting external tools and services via `.kiro/settings/mcp.json`

## Quick Reference

Load these references when needed for detailed guidance:

### Getting Started
- **Installation & Setup**: `references/getting-started.md`
  - Prerequisites, installation, workspace setup, first run

### Spec-Driven Development
- **Specs Workflow**: `references/specs-workflow.md`
  - Requirements, design, tasks, bugfix specs, property-based testing

### Steering & Configuration
- **Steering Files**: `references/steering-files.md`
  - Always-included, conditional (fileMatch), manual inclusion, front-matter format

- **Configuration**: `references/configuration.md`
  - Settings hierarchy, MCP config, workspace vs user settings

### Skills & Commands
- **Skills**: `references/skills.md`
  - Creating skills, skill.md format, references directory, activation patterns

- **Commands**: `references/commands.md`
  - Command file format, front-matter, argument hints, workflow patterns

### Integration & Extension
- **MCP Integration**: `references/mcp-integration.md`
  - mcp.json configuration, common servers, auto-approve, troubleshooting

- **Hooks**: `references/hooks.md`
  - Event types (fileEdited, preToolUse, postToolUse, promptSubmit, etc.)
  - Actions (askAgent, runCommand), hook schema, examples

### Advanced Usage
- **Autonomy Modes**: `references/autonomy-modes.md`
  - Autopilot vs Supervised mode, when to use each

- **Troubleshooting**: `references/troubleshooting.md`
  - Common issues, MCP problems, performance, workspace diagnostics

- **Best Practices**: `references/best-practices.md`
  - Project organization, steering conventions, skill design, team workflows

## Common Workflows

### Spec-Driven Feature Development
```
1. Create a spec: Kiro guides you through requirements -> design -> tasks
2. Execute tasks: Kiro implements each task from the spec sequentially
3. Validate: Property-based tests verify correctness properties
```

### Steering File Setup
```
# .kiro/steering/my-conventions.md
---
inclusion: always
description: Project coding conventions
---

Your conventions here...
```

### Hook Configuration
```json
{
  "name": "Lint on Save",
  "version": "1.0.0",
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx"]
  },
  "then": {
    "type": "runCommand",
    "command": "npm run lint"
  }
}
```

### MCP Server Setup
```json
{
  "mcpServers": {
    "my-server": {
      "command": "uvx",
      "args": ["my-mcp-server@latest"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Skill Creation
```
.kiro/skills/my-skill/
  skill.md          # Main skill file with front-matter
  references/       # Supporting reference documents
    guide.md
```

## Instructions for Kiro

When responding to Kiro-related questions:

1. **Identify the topic** from the user's question
2. **Load relevant references** from the Quick Reference section above
3. **Provide specific guidance** using information from loaded references
4. **Include examples** when helpful

**Loading references:**
- Read reference files only when needed for the specific question
- Multiple references can be loaded for complex queries

**For setup questions:** Load `references/getting-started.md`

**For spec questions:** Load `references/specs-workflow.md`

**For steering questions:** Load `references/steering-files.md`

**For skill creation:** Load `references/skills.md`

**For command questions:** Load `references/commands.md`

**For MCP questions:** Load `references/mcp-integration.md`

**For hook questions:** Load `references/hooks.md`

**For configuration:** Load `references/configuration.md`

**For autonomy modes:** Load `references/autonomy-modes.md`

**For troubleshooting:** Load `references/troubleshooting.md`

**For best practices:** Load `references/best-practices.md`

**Documentation links:**
- Kiro docs: https://kiro.dev/docs/
- GitHub: https://github.com/aws/kiro

Provide accurate, actionable guidance based on the loaded references and official documentation.

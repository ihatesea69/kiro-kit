# Getting Started with Kiro

## Prerequisites

- Supported OS: Windows, macOS, Linux
- Internet connection for AI features

## Installation

Download Kiro from https://kiro.dev and install for your platform.

## First Run

1. Open Kiro
2. Open or create a workspace folder
3. Start chatting with the AI agent in the chat panel

## Workspace Setup

Kiro stores configuration in `.kiro/` at the workspace root:

```
.kiro/
  settings/
    mcp.json          # MCP server configuration
  steering/           # Steering files (conventions, rules)
  skills/             # Custom skills
  commands/           # Custom commands
  hooks/              # Agent hooks
  specs/              # Feature specs
```

## Authentication

- Sign in with your AWS account or supported identity provider
- API keys are managed automatically by the IDE

## Key Concepts

- **Chat**: Interact with the AI agent directly
- **Specs**: Structured feature development (requirements -> design -> tasks)
- **Steering**: Project-level instructions that guide the AI
- **Skills**: Modular capabilities activated by context
- **Hooks**: Automated actions on IDE events
- **MCP**: External tool integrations

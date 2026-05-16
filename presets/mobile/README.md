# Mobile Preset

A comprehensive kit for Flutter (primary focus) and React Native mobile development. Includes agents, skills, commands, hooks, workflows, and steering files tailored for cross-platform mobile engineering.

## Focus Areas

- Flutter widget architecture and state management (BLoC, Riverpod, Provider)
- React Native component patterns and navigation
- Platform-specific adaptations (iOS HIG, Material Design)
- Mobile performance optimization (battery, memory, network)
- Offline-first architecture and local storage
- Accessibility (iOS VoiceOver, Android TalkBack)
- Testing (widget tests, integration tests, golden tests)
- App store deployment (iOS App Store, Google Play)

## Structure

```
mobile/
  manifest.json          Preset manifest
  README.md              This file
  agents/                20 agent definitions
  skills/                21 skill folders
  commands/              29+ command files (including mobile/ category)
  hooks/                 Cross-platform hook scripts
  steering/              Flutter conventions and mobile patterns
  workflows/             4 workflow files
  settings.json          Kiro settings (statusLine, hooks)
  statusline.js          Statusline script (Node, primary)
  statusline.sh          Statusline script (bash fallback)
  statusline.ps1         Statusline script (PowerShell fallback)
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  specs/_templates/       Mobile spec templates
  docs/                  Documentation templates (code-standards, architecture, roadmap)
```

## Minimum Thresholds

- agents: 20
- skills: 21
- commands: 29
- hooks: 6
- workflows: 4

## Recommended Usage

```bash
npx kiro-kit init --preset mobile
```

Best suited for projects using:
- Flutter 3+ / Dart 3+
- React Native 0.72+
- TypeScript (for RN projects)
- Platform-specific native modules

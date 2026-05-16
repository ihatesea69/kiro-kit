# Frontend Preset

A comprehensive kit for React/Next.js + TypeScript frontend development. Includes agents, skills, commands, hooks, workflows, and steering files tailored for modern frontend engineering.

## Focus Areas

- React component architecture and patterns
- Next.js App Router, Server Components, SSR/SSG/ISR
- TypeScript strict mode and type safety
- Tailwind CSS and component libraries (shadcn/ui, Radix)
- Performance optimization (Core Web Vitals, bundle size)
- Accessibility (WCAG 2.1 AA compliance)
- Testing (Vitest, React Testing Library, Playwright)

## Structure

```
frontend/
  manifest.json          Preset manifest
  README.md              This file
  agents/                16 agent definitions
  skills/                20+ skill folders
  commands/              25+ command files (including frontend/ category)
  hooks/                 Cross-platform hook scripts
  steering/              React/Next.js conventions and patterns
  workflows/             4 workflow files
  settings.json          Kiro settings (statusLine, hooks)
  statusline.js          Statusline script (Node, primary)
  statusline.sh          Statusline script (bash fallback)
  statusline.ps1         Statusline script (PowerShell fallback)
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  specs/_templates/       Frontend spec templates
  docs/                  Documentation templates (code-standards, architecture, roadmap)
```

## Minimum Thresholds

- agents: 16
- skills: 20
- commands: 29
- hooks: 6
- workflows: 4

## Recommended Usage

```bash
npx kiro-kit init --preset frontend
```

Best suited for projects using:
- React 18+ / Next.js 14+
- TypeScript 5+
- Tailwind CSS
- pnpm or npm package management

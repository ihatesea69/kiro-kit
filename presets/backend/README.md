# Backend Preset

A comprehensive kit for Node.js, Python, and Go API development. Includes agents, skills, commands, hooks, workflows, and steering files tailored for backend engineering with focus on API design, database management, authentication, and deployment.

## Focus Areas

- RESTful and GraphQL API design patterns
- Database architecture (PostgreSQL, MongoDB, Redis)
- Authentication and authorization (OAuth 2.1, JWT, session management)
- Microservices and monolith patterns
- Error handling and logging strategies
- Security best practices (OWASP Top 10, input validation)
- Testing (unit, integration, load testing)
- Docker containerization and deployment
- CI/CD pipeline configuration

## Structure

```
backend/
  manifest.json          Preset manifest
  README.md              This file
  agents/                16 agent definitions
  skills/                20+ skill folders
  commands/              25+ command files (including backend/ category)
  hooks/                 Cross-platform hook scripts
  steering/              API design and security conventions
  workflows/             4 workflow files
  settings.json          Kiro settings (statusLine, hooks)
  statusline.js          Statusline script (Node, primary)
  statusline.sh          Statusline script (bash fallback)
  statusline.ps1         Statusline script (PowerShell fallback)
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  specs/_templates/       Backend spec templates
  docs/                  Documentation templates (code-standards, architecture, roadmap)
```

## Minimum Thresholds

- agents: 16
- skills: 20
- commands: 28
- hooks: 6
- workflows: 4

## Recommended Usage

```bash
npx kiro-kit init --preset backend
```

Best suited for projects using:
- Node.js 18+ (Express, Fastify, NestJS)
- Python 3.10+ (FastAPI, Django)
- Go 1.21+ (Gin, Echo, Fiber)
- PostgreSQL, MongoDB, or Redis
- Docker for containerization

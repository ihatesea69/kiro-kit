# DevOps Preset

A comprehensive kit for Docker, Kubernetes, Terraform, and CI/CD infrastructure engineering. Includes agents, skills, commands, hooks, workflows, and steering files tailored for modern DevOps practices.

## Focus Areas

- Docker containerization and multi-stage builds
- Kubernetes orchestration and Helm charts
- Terraform/OpenTofu infrastructure as code
- CI/CD pipeline design (GitHub Actions, GitLab CI)
- Cloud platforms (AWS, GCP, Azure)
- Monitoring, observability, and alerting
- Security scanning and compliance
- GitOps workflows and deployment strategies

## Structure

```
devops/
  manifest.json          Preset manifest
  README.md              This file
  agents/                20 agent definitions
  skills/                21 skill folders
  commands/              29+ command files (including devops/ category)
  hooks/                 Cross-platform hook scripts (8 hooks)
  steering/              Docker/Infrastructure conventions
  workflows/             4 workflow files
  settings.json          Kiro settings (statusLine, hooks)
  statusline.js          Statusline script (Node, primary)
  statusline.sh          Statusline script (bash fallback)
  statusline.ps1         Statusline script (PowerShell fallback)
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  specs/_templates/       DevOps spec templates
  docs/                  Documentation templates (code-standards, architecture, roadmap)
```

## Minimum Thresholds

- agents: 20
- skills: 21
- commands: 29
- hooks: 8
- workflows: 4

## Recommended Usage

```bash
npx kiro-kit init --preset devops
```

Best suited for projects using:
- Docker and container orchestration
- Kubernetes (EKS, GKE, AKS)
- Terraform or OpenTofu for IaC
- GitHub Actions or GitLab CI
- Cloud-native architecture

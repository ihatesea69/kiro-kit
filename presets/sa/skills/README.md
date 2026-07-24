# Skills Directory

This directory contains agent skills (Powers) for the DevOps preset. Each skill is a folder containing a `SKILL.md` file with front-matter metadata and activation instructions.

## Available Skills

| Skill | Description |
|-------|-------------|
| devops | Docker, Kubernetes, Terraform, and cloud infrastructure |
| debugging | Systematic debugging and root cause analysis |
| sequential-thinking | Structured step-by-step problem solving |
| repomix | Package repositories for AI analysis |
| container-security | Container image and runtime security |
| terraform-modules | Reusable Terraform module design |
| kubernetes-ops | Kubernetes operations and troubleshooting |
| ci-cd-patterns | CI/CD pipeline design patterns |
| planning | Technical solution planning |
| research | Technology research and evaluation |
| problem-solving | Systematic problem-solving techniques |
| code-review | Code review practices and verification |
| docs-seeker | Technical documentation search |
| databases | Database design and administration |
| backend-development | Server-side development practices |
| frontend-design | UI design for dashboards and admin panels |
| chrome-devtools | Browser automation and performance |
| web-frameworks | Web application frameworks |
| ai-multimodal | Multimedia content processing |
| media-processing | FFmpeg and ImageMagick operations |
| mcp-builder | Building MCP server integrations |
| mcp-management | Managing MCP server connections |
| skill-creator | Creating new skills |
| template-skill | Skill template for new skills |

## Structure

Each skill folder follows this structure:

```
<skill-name>/
  SKILL.md          Main skill file (concise, token-efficient)
  references/       Detailed documentation (optional)
  scripts/          Automation scripts (optional)
  assets/           Static assets (optional)
```

## Usage

Skills are activated by referencing their name. The agent reads `SKILL.md` for instructions and loads `references/` content only when deeper detail is needed.

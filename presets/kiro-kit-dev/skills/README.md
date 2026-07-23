# Skills

Skills provide specialized knowledge and workflows that agents can activate on demand. Each skill is a directory containing a `SKILL.md` file with activation triggers and guidelines.

## Available Skills

| Skill | Description |
|-------|-------------|
| backend-development | Node.js/Python/Go API development patterns |
| databases | PostgreSQL, MongoDB, Redis schema and query optimization |
| better-auth | Authentication and authorization implementation |
| mcp-builder | Building MCP server integrations |
| mcp-management | Managing MCP server configurations |
| devops | Docker, CI/CD, cloud infrastructure |
| debugging | Systematic root cause investigation |
| sequential-thinking | Structured multi-step problem solving |
| problem-solving | Techniques for complex challenges |
| planning | Feature decomposition and implementation planning |
| research | Technology evaluation and comparison |
| code-review | Structured code review practices |
| docs-seeker | Finding technical documentation |
| frontend-design | Admin panels and dashboard UIs |
| repomix | Codebase packaging for AI analysis |
| ai-multimodal | Multimedia content processing |
| media-processing | FFmpeg and ImageMagick operations |
| skill-creator | Creating new skills |
| template-skill | Skill template for new skills |

## Structure

Each skill follows this structure:

```
skills/skill-name/
  SKILL.md           Main skill file (concise, token-efficient)
  references/        Detailed documentation (loaded on demand)
  scripts/           Executable scripts
  assets/            Static assets
```

## Adding Skills

See `INSTALLATION.md` for instructions on adding new skills.

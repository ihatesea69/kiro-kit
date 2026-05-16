# _template Preset

Baseline preset template. Copy this directory and customize for new presets.

## Structure

```
_template/
  manifest.json          Preset manifest (schema below)
  README.md              This file
  agents/                Agent definitions (*.md with YAML front-matter)
  skills/                Skill folders (each with SKILL.md)
  commands/              Command files (*.md, nesting 1-3 levels)
  hooks/                 Hook scripts (tri-platform: .js, .sh, .ps1)
  steering/              Steering files (*.md with inclusion front-matter)
  workflows/             Always-on workflow files (*.md)
  settings.json          Kiro settings (statusLine, hooks registration)
  statusline.js          Statusline script (Node, primary)
  statusline.sh          Statusline script (bash, Unix fallback)
  statusline.ps1         Statusline script (PowerShell, Windows fallback)
  .mcp.json.example      MCP server config template (placeholders only)
  .env.example           Project-level environment variables template
  specs/_templates/       Spec templates (requirements, design, tasks)
  docs/                  Documentation templates
```

## Manifest Schema

The `manifest.json` file describes the preset contents and metadata.

| Field         | Type     | Description                                      |
|---------------|----------|--------------------------------------------------|
| name          | string   | Preset identifier (kebab-case)                   |
| version       | string   | Semver version                                   |
| description   | string   | One-line description of the preset               |
| category      | string   | One of: frontend, backend, fullstack, mobile, devops, data-ai |
| files         | array    | List of file entries with source, target, type   |
| mcpServers    | object   | MCP server declarations (name -> config)         |
| hooks         | object   | Hook registrations (event -> handler[])          |
| tags          | array    | Searchable tags for the preset                   |
| minCounts     | object   | Minimum artifact counts for structural validation|

### File Entry Schema

Each entry in `files[]`:

| Field      | Type    | Required | Description                          |
|------------|---------|----------|--------------------------------------|
| source     | string  | yes      | Relative path within preset dir      |
| target     | string  | yes      | Relative path in user workspace      |
| type       | string  | yes      | Artifact type (agent, skill, command, hook, workflow, steering, config, doc, spec) |
| executable | boolean | no       | Set chmod +x on Unix (for scripts)   |

## File Conventions

- Agents: YAML front-matter with `name` (kebab-case) and `description` (required)
- Commands: YAML front-matter with `description` (required), optional `inclusion`, `argument-hint`
- Skills: Each skill folder contains `SKILL.md` with front-matter (`name`, `description`)
- Hooks: Tri-platform scripts (.js primary, .sh/.ps1 fallbacks)
- Workflows: Markdown files, always injected into agent context
- Steering: Markdown with front-matter `inclusion` (manual, always, fileMatch)

## Minimum Thresholds

Structural tests validate each preset meets these minimums:

- agents: 12
- skills: 20
- commands: 25
- hooks: 6
- workflows: 4

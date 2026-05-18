# Best Practices

## Project Organization

- Keep `.kiro/` directory in version control
- Use consistent naming (kebab-case for directories)
- Document custom skills and commands in project README
- Share steering files across team via git

## Steering Conventions

- One topic per steering file
- Use "always" only for critical, universal rules
- Use "fileMatch" for language/framework-specific guidance
- Keep files concise (under 100 lines ideally)
- Include examples in steering content

## Skill Design

- Focus each skill on one domain
- Write clear activation descriptions
- Use references for detailed content
- Keep main skill.md as an overview/router
- Test activation with various phrasings

## Hook Patterns

- Use file hooks for linting and formatting
- Use postTaskExecution for test validation
- Use preToolUse for access control
- Keep hook commands fast (under 30 seconds)
- Log hook failures for debugging

## Team Workflows

- Standardize steering files across projects
- Share skills via presets or git submodules
- Document MCP server requirements in README
- Use specs for all non-trivial features
- Review spec documents before task execution

## Cost Management

- Use steering to keep responses focused
- Avoid overly broad "always" steering
- Disable unused MCP servers
- Use Supervised mode for exploratory work
- Keep skill references concise

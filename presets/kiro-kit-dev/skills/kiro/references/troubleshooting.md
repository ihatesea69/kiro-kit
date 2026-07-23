# Troubleshooting

## Common Issues

### MCP Server Not Starting
- Verify `uvx` is installed: run `uvx --version`
- Check mcp.json syntax (valid JSON)
- Ensure environment variables are set
- Check Kiro's MCP Server view for error logs
- Try restarting from command palette

### Steering Files Not Loading
- Verify front-matter has correct `inclusion` field
- Check file is in `.kiro/steering/` directory
- For fileMatch, verify pattern matches target files
- Ensure no YAML syntax errors in front-matter

### Skills Not Activating
- Check skill.md has valid front-matter (name, description)
- Verify skill directory is in `.kiro/skills/`
- Ensure description contains relevant trigger keywords
- Try referencing the skill explicitly

### Hooks Not Triggering
- Verify hook JSON schema is valid
- Check event type matches expected trigger
- For file events, verify patterns match file paths
- Check command exists and is executable

### Performance Issues
- Reduce number of "always" steering files
- Keep skill references focused and concise
- Disable unused MCP servers
- Clear workspace cache if needed

## Debug Steps

1. Check Kiro output panel for errors
2. Verify `.kiro/` directory structure
3. Validate JSON/YAML syntax in config files
4. Try disabling extensions one by one
5. Restart Kiro if issues persist

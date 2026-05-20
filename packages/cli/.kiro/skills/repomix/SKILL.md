---
name: repomix
description: Package code repositories into single AI-friendly files for analysis. Use when you need to understand unfamiliar codebases or prepare context for AI consumption.
---

# Repomix

Activate this skill when packaging codebases for analysis or understanding repository structure.

## When to Use

- Analyzing an unfamiliar codebase
- Creating repository snapshots for context
- Preparing code for security audits
- Generating documentation context
- Evaluating third-party libraries

## Usage

```bash
# Pack current directory
repomix

# Pack with specific includes
repomix --include "src/**/*.ts"

# Pack remote repository
repomix --remote https://github.com/user/repo

# Output formats
repomix --style xml    # default, best for AI
repomix --style markdown
repomix --style plain
```

## Rules

- Use include/exclude patterns to focus on relevant code
- Prefer XML format for AI consumption (best token efficiency)
- Exclude test fixtures, build output, and node_modules
- Use --remote for analyzing external repositories
- Check output size before feeding to AI (token limits)

---
name: repomix
description: Package code repositories into single AI-friendly files for analysis. Use when you need to understand unfamiliar codebases or prepare context for AI tools.
---

# Repomix

Activate when you need to package a codebase for AI analysis or understand an unfamiliar repository.

## When to Use

- Analyzing third-party libraries or repositories
- Creating repository snapshots for LLM context
- Preparing codebase for security audits
- Understanding unfamiliar project structures
- Generating documentation context

## Usage

```bash
# Pack current directory
repomix

# Pack with specific includes
repomix --include "src/**/*.ts"

# Pack remote repository
repomix --remote https://github.com/user/repo

# Output formats
repomix --style xml    # XML format (default)
repomix --style markdown  # Markdown format
```

## Options

- `--include` / `--exclude`: glob patterns for file filtering
- `--remote`: pack a remote GitHub repository
- `--style`: output format (xml, markdown, plain)
- `--output`: custom output file path

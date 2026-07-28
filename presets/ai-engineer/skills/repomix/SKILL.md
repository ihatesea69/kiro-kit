---
name: repomix
description: Package code repositories into single AI-friendly files for analysis. Use when you need to understand a codebase structure or prepare context for analysis.
---

# Repomix

Activate this skill when packaging codebases for analysis or generating repository summaries.

## When to Use

- Analyzing unfamiliar ML codebase structure
- Creating repository snapshots for context
- Generating documentation from code
- Preparing codebase for security audit
- Understanding third-party library internals

## Usage

```bash
# Pack current directory
repomix

# Pack with specific includes
repomix --include "src/**/*.py"

# Pack remote repository
repomix --remote https://github.com/user/repo

# Output as markdown
repomix --style markdown
```

## Rules

- Use include/exclude patterns to focus on relevant code
- Output goes to `repomix-output.xml` by default
- Use for understanding, not for copying code
- Respect license terms of analyzed repositories


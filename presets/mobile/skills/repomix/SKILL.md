---
name: repomix
description: Package code repositories into single AI-friendly files for analysis. Use when you need to understand unfamiliar codebases or create repository snapshots.
---

# Repomix

Activate this skill when you need to package or analyze entire codebases.

## When to Use

- Analyzing unfamiliar mobile project structures
- Creating repository snapshots for review
- Packaging codebases for AI analysis
- Understanding third-party library internals
- Preparing for security audits

## Usage

```bash
# Local project
repomix

# Remote repository
repomix --remote https://github.com/user/repo

# With filters
repomix --include "lib/**/*.dart" --exclude "**/*.g.dart"
```

## Rules

- Use include/exclude patterns to focus on relevant code
- Exclude generated files (*.g.dart, *.freezed.dart, build/)
- Output goes to `repomix-output.xml` by default
- Use for understanding, not for copying code verbatim

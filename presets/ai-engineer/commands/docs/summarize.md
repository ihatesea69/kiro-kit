---
description: Analyze the codebase and generate documentation summary
inclusion: manual
argument-hint: "[focused-topics] [should-scan-codebase]"
---

## Arguments
TOPICS: $1 (default: all)
SCAN: $2 (default: false, boolean)

## Workflow
1. Read existing documentation in `docs/` directory
2. If SCAN is true: analyze source code for undocumented modules
3. Generate summary report of documentation coverage
4. Identify gaps between code and documentation
5. Suggest documentation improvements


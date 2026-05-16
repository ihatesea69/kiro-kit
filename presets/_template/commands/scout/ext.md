---
description: Search codebase using external agentic tools
inclusion: manual
argument-hint: "[query] [scale]"
---

## Arguments
QUERY: $1 (required)
SCALE: $2 (default: 3)

## Workflow
1. Analyze query and divide codebase into search sections
2. Launch external tools in parallel for each section
3. Collect and deduplicate results
4. Report organized file list with coverage notes

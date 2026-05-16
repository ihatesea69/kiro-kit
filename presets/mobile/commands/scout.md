---
description: Scout the codebase for files relevant to a specific task
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required, description of what to find)
SCALE: $2 (default: 3, number of parallel search agents)

## Workflow
1. Analyze the search request and identify key directories
2. Divide codebase into logical sections (lib/, test/, ios/, android/)
3. Launch SCALE parallel agents to search different sections
4. Synthesize results into organized file list
5. Report findings grouped by layer (UI, logic, data, platform)

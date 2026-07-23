---
description: Scout the codebase for files relevant to a task
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required)
SCALE: $2 (default: 3)

## Workflow
1. Analyze the search query and identify key directories
2. Divide codebase into logical sections for parallel searching
3. Search each section for files matching the query
4. Deduplicate and organize results by category
5. Present file list with any coverage gaps noted

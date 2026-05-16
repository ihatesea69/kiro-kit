---
description: Scout codebase using external agentic tools for faster parallel search
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required)
SCALE: $2 (default: 3)

## Workflow
1. Analyze search query and divide into parallel tasks
2. Launch external agents (Gemini, OpenCode) for each section
3. Collect results within 3-minute timeout
4. Deduplicate and organize findings
5. Present file list with coverage gaps

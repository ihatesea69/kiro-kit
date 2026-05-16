---
description: Scout codebase using external agentic tools (Gemini, OpenCode)
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required, description of what to find)
SCALE: $2 (default: 3, number of parallel agents)

## Workflow
1. Analyze search request and divide into parallel tasks
2. Launch external agents (gemini/opencode) for each section
3. Set 3-minute timeout per agent
4. Collect and deduplicate results
5. Present organized file list


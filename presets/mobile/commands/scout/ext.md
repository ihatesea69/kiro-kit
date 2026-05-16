---
description: Scout codebase using external agentic tools for faster parallel search
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required, description of what to find)
SCALE: $2 (default: 3, number of parallel agents)

## Workflow
1. Analyze search request and divide into logical sections
2. Launch external agents (Gemini, OpenCode) in parallel
3. Each agent searches assigned directories with 3-minute timeout
4. Collect and deduplicate results
5. Present organized file list grouped by relevance

---
description: Scout codebase using external agentic tools for faster parallel search
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required)
SCALE: $2 (default: 3)

## Workflow
1. Analyze search query and determine agent count
2. Divide codebase into logical sections
3. Launch parallel searches via external tools (Gemini, OpenCode)
4. Collect results within 3-minute timeout per agent
5. Deduplicate and organize findings
6. Report results with coverage gaps

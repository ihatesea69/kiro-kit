---
description: Scout codebase using external agentic tools for faster search
inclusion: manual
argument-hint: "[search-query] [scale]"
---

## Arguments
QUERY: $1 (required)
SCALE: $2 (default: 3)

## Workflow
1. Analyze search query and determine agent count
2. Divide codebase into sections for parallel search
3. Launch external tools (Gemini, OpenCode) in parallel
4. Collect results within 3-minute timeout
5. Synthesize and deduplicate findings
6. Report organized file list

---
description: Extract design specs from Figma for mobile implementation
inclusion: manual
argument-hint: "[figma-url]"
---

## Arguments
URL: $1 (required, Figma file or frame URL)

## Workflow
1. Access Figma design via MCP or API
2. Extract component specs (colors, spacing, typography)
3. Map to platform design tokens (Flutter ThemeData / RN StyleSheet)
4. Generate asset export list with required densities
5. Document implementation notes for platform-specific adaptations

---
inclusion: always
description: draw.io vs Mermaid choice, stencil discipline (search real stencils, never fabricate shape names), layout topologies, and color/legend rules.
---

# Diagramming Conventions

## Tool Choice: draw.io vs Mermaid

| Situation | Use |
|-----------|-----|
| Diagram embedded in Markdown (specs, READMEs, ADRs) | Mermaid (`mermaid-diagrams` skill) |
| C4 L1–L3 logical views, sequence, state | Mermaid |
| Deployment views with official AWS/Azure/GCP icons | draw.io (`drawio-aws` / `drawio-azure` / `drawio-gcp` skills) |
| Exec/customer-facing artifact, printed or in decks | draw.io |
| Quick sketch during discussion | Mermaid |

Sources are the artifact: commit `.mmd` and `.drawio` files; PNG/SVG exports
are derived and regenerated, never hand-edited.

## draw.io Prerequisite

The draw.io skills call the external `drawio-ai` CLI. It must be installed by
the user first:

```bash
npm i -g github:sparklabx/drawio-ai-kit
```

If `drawio-ai` is not on PATH, stop and ask the user to install it — never run
global npm installs on their behalf.

## Stencil Discipline

- **Never fabricate shape/stencil names.** AWS shapes are `mxgraph.aws4.*`
  entries with exact names — always discover them with
  `drawio-ai search "<service>"` and use what it returns verbatim.
- Validate every generated diagram: `drawio-ai validate <file.drawio>` must
  pass (stencils, colors, nesting, geometry) before the artifact ships.
- Use current-generation icon sets (aws4, latest Azure/GCP packs); do not mix
  icon generations in one diagram.

## Layout Topologies

Pick one topology per diagram and keep flow direction consistent:

- **Pipeline** — left→right stages (data pipelines, CI/CD, request paths).
- **Hierarchy** — top→down layers (three-tier, layered services).
- **Network** — nested containers for region → VPC → subnet → resource;
  nesting depth mirrors the real boundary hierarchy.
- **Hub-and-spoke** — one central element (event bus, transit gateway) with
  radial spokes.
- **Mesh** — only when the point IS the interconnection density; otherwise
  decompose.

Edges: orthogonal routing in draw.io, minimal crossings, label protocol/verb on
every edge that isn't obvious.

## Color & Legend Rules

- Color encodes meaning, or it doesn't appear. Approved encodings: owned vs
  external, environment (prod/non-prod), data classification, new vs existing.
- Maximum 4 semantic colors per diagram; any use of color requires a legend on
  the canvas.
- Keep provider icon fills as issued (AWS orange family etc.); never recolor
  official icons.
- Group boundaries (VPC, subnet, account) use the provider's standard boundary
  styles, labeled top-left with name + CIDR/ID.

## Quality Bar (all diagrams)

1. Title on canvas: system, view type, date/version.
2. One concern per diagram; >15 nodes → split or zoom out a C4 level.
3. Every element labeled name + technology; no orphan/floating nodes.
4. Mermaid must compile (`mmdc`), draw.io must pass `drawio-ai validate`.

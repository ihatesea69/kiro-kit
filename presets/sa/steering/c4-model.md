---
inclusion: always
description: The C4 diagramming levels (context, container, component, code), when to use each, and how they pair with the mermaid and draw.io skills.
---

# C4 Model

C4 structures architecture diagrams as four zoom levels. Use the right level
for the audience; never mix levels in one diagram.

## The Levels

| Level | Name | Shows | Audience | Produce with |
|-------|------|-------|----------|--------------|
| 1 | System Context | Your system as one box + users + external systems | Everyone, incl. non-technical | `mermaid-diagrams` (C4Context) |
| 2 | Container | Deployable units: apps, services, databases, queues | Engineers + architects | `mermaid-diagrams` (C4Container) or draw.io skills |
| 3 | Component | Major building blocks inside one container | The team owning that container | `mermaid-diagrams` (C4Component) |
| 4 | Code | Classes/modules | Rarely worth drawing — generate from code if needed | — |

## Rules

- **Start at Level 1.** Every spec's design.md opens with a context diagram —
  if you cannot draw it, scope is unclear.
- **One container = one deployable/runnable thing** (API service, SPA, worker,
  database, event bus). Kubernetes pods, Lambda functions, and RDS instances
  are containers; an npm package is not.
- **Level 3 only for containers with genuine internal complexity.** A CRUD
  service does not need a component diagram.
- **Every element carries**: name, technology in brackets, one-line
  responsibility. Every relationship carries a verb + protocol.
- **External vs owned** must be visually distinct (C4 syntax does this via
  `System_Ext`/`Container_Ext`).
- Deployment topology (VPCs, AZs, regions) is NOT a C4 level — draw it as a
  separate deployment view (draw.io with provider icons, or Mermaid flowchart
  subgraphs).

## Pairing with the Diagram Skills

- Levels 1–3 embedded in Markdown → `mermaid-diagrams` skill (C4 syntax).
- Standalone artifacts with official AWS/Azure/GCP icons (deployment views,
  exec-facing diagrams) → `drawio-aws` / `drawio-azure` / `drawio-gcp` skills.
- Choice criteria live in the `diagramming-conventions` steering file.

## Placement in Specs

- design.md `## Architecture` → System Context (L1) + Container (L2) required;
  Component (L3) per complex container.
- Sequence diagrams complement C4 (behaviour vs structure) — one per critical
  flow, participants named after L2 containers.

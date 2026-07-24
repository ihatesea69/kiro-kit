---
name: architecture-doc
description: Produce .docx Solution Architecture Documents (SAD) with python-docx — context, requirements, views, decisions, NFRs. Use when the user asks for an architecture document, solution design document, HLD/LLD, or any .docx deliverable describing a system design.
---

# Architecture Document (SAD)

Generate Solution Architecture Documents as `.docx` files with `python-docx`.
The document is the durable, reviewable record of a design; the deck (see the
`architecture-deck` skill) is its presentation companion.

## When to Use

- "Write the solution architecture document"
- "Turn this spec into an HLD/LLD"
- Formal design sign-off, vendor RFP responses, audit evidence
- Any `.docx` deliverable whose subject is a system architecture

## Prerequisites

```bash
python -c "import docx" 2>/dev/null || pip install python-docx
```

Diagrams are embedded as PNG exports of their `.drawio` / `.mmd` sources
(`drawio-ai render`, `mmdc`) — same rule as the deck skill: never fork diagram
content into a second tool.

## SAD Template

Use these sections in this order. Sections may be marked "Not applicable —
<reason>" but never silently dropped.

1. **Document Control** — version table (version, date, author, change), reviewers/approvers, distribution.
2. **Executive Summary** — one page max: problem, proposed solution, cost band, key risks.
3. **Business Context** — drivers, goals, success metrics, stakeholders (table: name, role, concern).
4. **Requirements**
   - Functional requirements summary (reference the spec's `requirements.md` IDs — do not duplicate full text).
   - Non-functional requirements (table: NFR, target, measurement method) — availability, latency, throughput, RTO/RPO, security/compliance, cost ceiling.
5. **Constraints & Assumptions** — technology mandates, budget, deadlines, team skills, regulatory scope.
6. **Architecture Views** (the core — one subsection per view)
   - Context view (C4 L1 diagram + external dependency table)
   - Functional/container view (C4 L2–3 diagrams, responsibility table)
   - Data view (data stores, classification, retention, lineage)
   - Deployment view (regions/AZs, environments, sizing, scaling policy)
   - Security view (identity, network boundaries, encryption, secrets)
   - Operations view (observability, alerting, runbooks, DR)
7. **Architecture Decisions** — ADR summary table (ID, decision, status, rationale); link full ADRs from `docs/adr/`.
8. **Well-Architected Review** — 6-pillar table: pillar, finding, severity, remediation.
9. **Risks & Mitigations** — table: risk, likelihood, impact, mitigation, owner.
10. **Roadmap** — phases with scope and exit criteria.
11. **Glossary & References**

## python-docx Skeleton

```python
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()  # or Document("corporate-template.docx") to inherit styles

doc.add_heading("Order Platform — Solution Architecture Document", level=0)

def control_table():
    t = doc.add_table(rows=1, cols=4)
    t.style = "Light Grid Accent 1"
    for i, h in enumerate(["Version", "Date", "Author", "Change"]):
        t.rows[0].cells[i].text = h
    r = t.add_row().cells
    r[0].text, r[1].text, r[2].text, r[3].text = "1.0", "2026-07-24", "SA team", "Initial issue"

def add_view(title, png_path, caption):
    doc.add_heading(title, level=2)
    doc.add_picture(png_path, width=Inches(6.5))
    p = doc.add_paragraph(caption)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.runs[0].font.size = Pt(9)
    p.runs[0].font.italic = True

doc.add_heading("1. Document Control", level=1); control_table()
doc.add_page_break()
doc.add_heading("6. Architecture Views", level=1)
add_view("6.1 Context View", "diagrams/context.png", "Figure 1 — System context (C4 L1)")
doc.save("solution-architecture.docx")
```

Style rules:

- Use built-in heading levels (`add_heading`) so the Word TOC works; insert a
  TOC placeholder note ("Insert → Table of Contents") after Document Control.
- Every figure gets a numbered caption; every table a header row with a table
  style. Reference figures in prose ("see Figure 3"), never "the diagram below".
- Requirements and decisions are referenced by ID (`R3.2`, `ADR-007`) so the
  document stays consistent with the spec as it evolves.

## Sourcing Content

With a Kiro spec present, map:

- `requirements.md` → section 4 (IDs + summaries)
- `design.md` Architecture/Files & Interfaces → section 6 views
- `design.md` Error Handling → sections 6 (operations view) and 9 (risks)
- ADRs / decision sections → section 7
- Well-Architected notes → section 8

## Verification Checklist

1. Reopen the file and assert heading structure: every numbered section 1–11 present.
2. All embedded images resolved from committed `.drawio`/`.mmd` sources.
3. NFR table has a measurable target in every row (a number, a percentile, or a standard — never "high").
4. Document Control version matches the filename or release tag.

---
name: architecture-deck
description: Produce .pptx architecture presentations (title, context, component, sequence, deployment slides) with python-pptx. Use when the user asks for an architecture deck, solution presentation, design review slides, or any .pptx deliverable about a system design.
---

# Architecture Deck

Build PowerPoint architecture presentations that walk an audience from business
context down to deployment detail. Output is a `.pptx` file generated with
`python-pptx`; diagrams are exported as PNG from draw.io or Mermaid sources and
embedded as pictures.

## When to Use

- "Create a deck for the architecture review board"
- "Turn this design.md into slides"
- Solution proposals, design reviews, migration briefings, ADR walkthroughs
- Any `.pptx` deliverable whose subject is a system architecture

## Prerequisites

```bash
python -c "import pptx" 2>/dev/null || pip install python-pptx
```

For embedded diagrams you also need rendered images:

- draw.io sources: `drawio-ai render diagram.drawio --format png` (see the
  `drawio-aws` skill), or File → Export in the draw.io app.
- Mermaid sources: `npx -y @mermaid-js/mermaid-cli -i flow.mmd -o flow.png -s 3`
  (`-s 3` gives print-quality scale).

Never draw architecture shapes with native PowerPoint autoshapes when a real
diagram source exists — render the source and embed the image, so the diagram
stays maintainable in one place.

## Standard Slide Sequence

Follow this order unless the user asks otherwise. Cut slides that have no
content rather than padding them.

| # | Slide | Content |
|---|-------|---------|
| 1 | Title | Solution name, author, date, version, confidentiality note |
| 2 | Agenda | 4–6 bullets max |
| 3 | Business Context | Problem, drivers, success criteria — no technology yet |
| 4 | Requirements Snapshot | Top functional + non-functional requirements (table) |
| 5 | System Context | C4 Level 1 diagram: system, users, external systems |
| 6 | Container / Component View | C4 Level 2–3 diagram(s), one per slide |
| 7 | Key Flows | Sequence diagram per critical flow (1 flow per slide) |
| 8 | Deployment View | Regions/AZs/VPCs, environments, scaling model |
| 9 | Security & Compliance | AuthN/Z, data protection, network boundaries |
| 10 | Cost & Operations | Cost drivers, observability, runbooks |
| 11 | Decisions & Trade-offs | Key ADRs: chosen option + one-line rationale each |
| 12 | Risks & Next Steps | Top risks with mitigations, roadmap |
| 13 | Appendix | Detail tables, alternative options, glossary |

## Authoring Rules

- **One message per slide.** The slide title states the takeaway ("RDS Multi-AZ
  keeps RPO under 5 minutes"), not the topic ("Database").
- **6×6 guard rail**: at most ~6 bullets, ~6 words each. Long prose belongs in
  the architecture document (see the `architecture-doc` skill), not the deck.
- **Diagrams fill the slide.** Insert the PNG at maximum size that preserves the
  aspect ratio; put the caption in the notes, not on the slide.
- **Speaker notes carry the narrative.** Every diagram slide gets 3–6 sentences
  of notes explaining what to say.
- **Consistent geometry.** Use the same slide layout indices throughout; do not
  mix template families.

## python-pptx Skeleton

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()  # or Presentation("corporate-template.pptx")
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9

def title_slide(title, subtitle):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = title
    s.placeholders[1].text = subtitle
    return s

def bullet_slide(title, bullets):
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = title
    tf = s.placeholders[1].text_frame
    tf.text = bullets[0]
    for b in bullets[1:]:
        p = tf.add_paragraph(); p.text = b; p.level = 0
    return s

def diagram_slide(title, png_path, notes=""):
    s = prs.slides.add_slide(prs.slide_layouts[5])  # title only
    s.shapes.title.text = title
    s.shapes.add_picture(png_path, Inches(0.6), Inches(1.3), height=Inches(5.6))
    if notes:
        s.notes_slide.notes_text_frame.text = notes
    return s

title_slide("Order Platform — Solution Architecture", "v1.0 · 2026-07-24")
diagram_slide("System Context", "diagrams/context.png",
              notes="Three actor types; payments and email are external.")
prs.save("architecture-deck.pptx")
```

When a corporate `.pptx`/`.potx` template is provided, open it with
`Presentation(path)` and reuse its layouts instead of the defaults; inspect
layout names first: `[l.name for l in prs.slide_layouts]`.

## Sourcing Content

When a spec exists, map it mechanically:

- `requirements.md` → Requirements Snapshot slide (top 5–7 criteria)
- `design.md` Architecture section → context/container/component slides
- `design.md` Error Handling / Testing → operations + risks slides
- ADR files → Decisions & Trade-offs slide

## Verification Checklist

1. Open count check: `python -c "from pptx import Presentation; print(len(Presentation('architecture-deck.pptx').slides.__iter__.__self__._sldIdLst))"` or simply reopen and iterate slides.
2. Every diagram slide has a non-empty notes frame.
3. No slide overflows: text frames must not autofit below 14 pt.
4. Filenames of embedded PNGs are committed next to their `.drawio`/`.mmd` sources.

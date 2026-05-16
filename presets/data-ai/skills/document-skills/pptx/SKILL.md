---
name: document-skills-pptx
description: Process and generate PowerPoint presentations programmatically. Use when creating data presentations, extracting content from slides, or automating report generation.
---

# Document Skills - PPTX

Activate this skill when working with PowerPoint presentations in Python.

## When to Use

- Generating presentations from analysis results
- Extracting text and data from existing presentations
- Creating templated slide decks with charts
- Automating weekly/monthly report presentations
- Converting data visualizations to slide format

## Libraries

- **python-pptx**: Create and modify PPTX files
- **pptx2md**: Convert presentations to Markdown

## Usage

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = "Q4 Analysis Results"
slide.placeholders[1].text = "Data Science Team"

# Chart slide
slide = prs.slides.add_slide(prs.slide_layouts[5])
slide.shapes.title.text = "Revenue Trends"
slide.shapes.add_picture("chart.png", Inches(1), Inches(2))

prs.save("report.pptx")
```

## Rules

- Use slide layouts for consistent formatting
- Keep chart images at appropriate resolution (150+ DPI)
- Limit text per slide for readability
- Use master slides for branding consistency
- Handle missing placeholders gracefully


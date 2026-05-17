---
name: ai-multimodal
description: >-
  Process and generate multimedia content using Google Gemini API. Use when
  analyzing images, processing documents, transcribing audio, or generating
  visual content for data science workflows.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# AI Multimodal

Activate this skill when working with images, documents, audio, or multimedia content in data/AI projects.

## When to Use

- Analyzing charts, plots, and visualizations
- Processing PDF research papers for extraction
- Generating diagrams from text descriptions
- Extracting tables from scanned documents
- Transcribing audio recordings of meetings/interviews

## Capabilities

- Image analysis: chart interpretation, diagram understanding
- Document processing: PDF tables, research papers, forms
- Audio processing: transcription with timestamps
- Video analysis: presentation extraction, lecture notes
- Image generation: diagrams, flowcharts, architecture visuals

## Data Science Applications

- Extract data tables from PDF reports
- Analyze matplotlib/seaborn plot outputs
- Process handwritten notes and whiteboard photos
- Generate architecture diagrams for ML pipelines
- Transcribe data review meetings

## Rules

- Always verify extracted numerical data against source
- Use appropriate model for task complexity
- Handle large files with proper chunking
- Validate OCR results for data accuracy
- Respect content licensing and attribution


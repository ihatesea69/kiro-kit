---
name: ai-multimodal
description: >-
  Process and generate multimedia content using AI APIs. Use when working with
  images, audio, video, or document analysis.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# AI Multimodal

Activate this skill when processing or generating multimedia content.

## When to Use

- Analyzing images or screenshots
- Processing audio files (transcription, summarization)
- Extracting data from documents (PDF, forms)
- Generating images from text prompts
- Processing video content

## Capabilities

- Image analysis: captioning, OCR, object detection, visual Q&A
- Audio processing: transcription with timestamps, summarization
- Document extraction: tables, forms, charts from PDFs
- Image generation: text-to-image, editing, composition
- Video analysis: scene detection, temporal analysis

## Rules

- Use appropriate model for the task (vision vs audio vs generation)
- Respect file size limits for each API
- Handle processing errors gracefully
- Validate output quality before using results
- Consider privacy implications of media processing

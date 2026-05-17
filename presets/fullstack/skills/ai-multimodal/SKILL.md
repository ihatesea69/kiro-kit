---
name: ai-multimodal
description: >-
  Process and generate multimedia content using Google Gemini API. Use when
  working with images, audio, video, or documents that need AI analysis or
  generation.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# AI Multimodal

Activate when working with multimedia content that needs AI processing or generation.

## When to Use

- Analyzing images (captioning, OCR, object detection)
- Processing audio files (transcription, summarization)
- Understanding video content (scene detection, Q&A)
- Extracting data from documents (PDF tables, forms)
- Generating images from text prompts

## Capabilities

- Image analysis: captioning, OCR, visual Q&A, segmentation
- Audio processing: transcription with timestamps, summarization
- Video understanding: scene detection, temporal analysis
- Document extraction: PDF tables, forms, charts, diagrams
- Image generation: text-to-image, editing, composition

## Usage Notes

- Requires GEMINI_API_KEY environment variable
- Supports models: Gemini 2.5, Gemini 2.0
- Context window up to 2M tokens
- Audio support up to 9.5 hours
- Video support up to 6 hours

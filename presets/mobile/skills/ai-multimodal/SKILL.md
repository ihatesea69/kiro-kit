---
name: ai-multimodal
description: >-
  Process and generate multimedia content using AI APIs. Use when analyzing
  images, processing audio/video, generating assets, or implementing multimodal
  features in mobile apps.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# AI Multimodal

Activate this skill when working with multimedia content processing or generation.

## When to Use

- Analyzing screenshots or UI mockups for implementation
- Processing images for mobile asset generation
- Generating app icons or splash screens
- Analyzing audio/video content
- Implementing AI-powered features (image recognition, OCR)
- Creating visual assets from text descriptions

## Capabilities

- Image analysis: captioning, object detection, OCR, visual Q&A
- Audio processing: transcription, summarization
- Video understanding: scene detection, temporal analysis
- Image generation: text-to-image, editing, composition
- Document extraction: PDF tables, forms, charts

## Mobile Integration

- Generate appropriately sized assets for different densities (1x, 2x, 3x)
- Optimize generated images for mobile (WebP, compressed PNG)
- Consider bandwidth when implementing AI features
- Cache AI results locally for offline access
- Handle API failures gracefully with fallback content

## Quality Standards

- Generated assets must meet platform size requirements
- Always verify generated content before using in production
- Consider privacy implications of sending user data to AI APIs
- Implement proper loading states for AI operations
- Handle rate limits and quota exhaustion gracefully

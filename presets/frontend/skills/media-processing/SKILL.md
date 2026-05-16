---
name: media-processing
description: Process multimedia files with FFmpeg and ImageMagick for format conversion, optimization, and manipulation. Use when working with images, video, or audio assets.
---

# Media Processing

Activate this skill when processing images, video, or audio files.

## When to Use

- Converting image formats (PNG to WebP, SVG to PNG)
- Optimizing images for web (compression, resizing)
- Processing video files (encoding, thumbnails)
- Batch processing media assets
- Creating responsive image sets

## Image Optimization for Web

```bash
# Convert to WebP with quality
magick input.png -quality 80 output.webp

# Resize for responsive images
magick input.png -resize 640x output-sm.webp
magick input.png -resize 1280x output-md.webp
magick input.png -resize 1920x output-lg.webp

# Generate favicon set
magick input.png -resize 16x16 favicon-16.png
magick input.png -resize 32x32 favicon-32.png
magick input.png -resize 180x180 apple-touch-icon.png
```

## Rules

- Always optimize images for web delivery
- Use WebP or AVIF for modern browsers
- Provide fallback formats for older browsers
- Maintain aspect ratios when resizing
- Use appropriate quality settings (80% for photos, lossless for UI)

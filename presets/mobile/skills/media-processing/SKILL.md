---
name: media-processing
description: >-
  Process multimedia files with FFmpeg and ImageMagick. Use when converting
  formats, optimizing assets, generating thumbnails, or preparing media for
  mobile apps.
license: MIT
---

# Media Processing

Activate this skill when processing images, video, or audio assets for mobile applications.

## When to Use

- Generating app icons at multiple densities
- Optimizing images for mobile (compression, format conversion)
- Creating splash screen assets
- Processing video for in-app playback
- Generating thumbnails and previews
- Converting between image formats (PNG, WebP, AVIF)

## Image Processing (ImageMagick)

- Resize for density buckets (1x, 2x, 3x / mdpi, hdpi, xhdpi, xxhdpi)
- Convert to WebP for smaller file sizes
- Generate adaptive icon layers (foreground, background)
- Batch process asset directories

## Video Processing (FFmpeg)

- Transcode for mobile playback (H.264, HEVC)
- Generate video thumbnails
- Compress for bandwidth efficiency
- Extract audio tracks

## Mobile Asset Guidelines

- iOS: @1x, @2x, @3x in asset catalogs
- Android: mdpi (1x), hdpi (1.5x), xhdpi (2x), xxhdpi (3x), xxxhdpi (4x)
- Flutter: 1.0x, 2.0x, 3.0x, 4.0x in assets directory
- Prefer vector (SVG) where possible for resolution independence

---
name: media-processing
description: Process multimedia files with FFmpeg and ImageMagick for encoding, conversion, and manipulation. Use when working with video, audio, or image processing pipelines.
---

# Media Processing

Activate this skill when processing media files (video, audio, images).

## When to Use

- Converting media formats
- Encoding video with specific codecs
- Extracting audio from video
- Resizing or cropping images
- Generating thumbnails
- Creating streaming manifests (HLS/DASH)
- Batch processing media files

## FFmpeg Common Operations

```bash
# Convert format
ffmpeg -i input.mp4 -c:v libx264 -crf 23 output.mp4

# Extract audio
ffmpeg -i video.mp4 -vn -acodec libmp3lame audio.mp3

# Generate thumbnail
ffmpeg -i video.mp4 -ss 00:00:05 -frames:v 1 thumb.jpg

# HLS streaming
ffmpeg -i input.mp4 -codec: copy -start_number 0 -hls_time 10 -f hls output.m3u8
```

## ImageMagick Common Operations

```bash
# Resize
convert input.jpg -resize 800x600 output.jpg

# Format conversion
convert input.png output.webp

# Batch processing
mogrify -resize 50% -format webp *.png
```

## Rules

- Always specify output codec explicitly
- Use hardware acceleration when available
- Set quality parameters appropriate for use case
- Validate output files after processing
- Handle large files with streaming (avoid loading into memory)

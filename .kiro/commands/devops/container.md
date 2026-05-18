---
description: Build, scan, and manage container images
inclusion: manual
argument-hint: "[action] [image-name]"
---

## Arguments
ACTION: $1 (required, options: build, scan, push, inspect)
IMAGE: $2 (default: auto-detect from Dockerfile)

## Workflow
1. If build: run multi-stage Docker build with proper tagging
2. If scan: run trivy/grype vulnerability scan on image
3. If push: tag and push to configured registry
4. If inspect: show image layers, size, and metadata
5. Report results with any security findings

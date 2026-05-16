---
description: Clean build artifacts, caches, and generated files
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: all, options: all, build, cache, generated)

## Workflow
1. Remove build directories (build/, .dart_tool/, android/app/build/)
2. Clear package caches if requested
3. Remove generated files (*.g.dart, *.freezed.dart) if requested
4. Run `flutter clean` or equivalent
5. Report cleaned directories and freed space

---
description: Bootstrap the mobile project with dependencies, environment setup, and initial configuration
inclusion: manual
argument-hint: "[platform]"
---

## Arguments
PLATFORM: $1 (default: all, options: all, flutter, react-native)

## Workflow
1. Detect project type (Flutter or React Native) from project files
2. Install dependencies (`flutter pub get` or `npm install`)
3. Verify SDK versions meet requirements
4. Run code generation if applicable (`build_runner`, `codegen`)
5. Verify builds compile on target platforms
6. Report setup status and any issues found

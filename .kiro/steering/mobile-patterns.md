---
inclusion: always
description: Cross-platform mobile development patterns for navigation, data persistence, and platform adaptation.
---

# Mobile Development Patterns

## Navigation

- Use declarative routing (go_router for Flutter, React Navigation for RN)
- Type-safe route parameters (no magic strings)
- Support deep linking for all public screens
- Implement authentication guards at router level
- Handle back button consistently across platforms

## Data Layer

- Repository pattern: abstract data sources behind interfaces
- Offline-first: local storage as source of truth, sync in background
- Use DTOs for API responses, map to domain entities
- Implement proper error types (network, validation, server)
- Cache strategies: time-based expiry, manual invalidation

## Error Handling

- Typed error classes (not generic exceptions)
- User-facing errors must be actionable
- Network errors: retry with exponential backoff
- Show appropriate UI for each error type
- Log errors to crash reporting service

## Platform Adaptation

- Use platform-aware widgets (Material on Android, Cupertino on iOS)
- Respect platform conventions (back gesture, navigation patterns)
- Handle permissions with platform-appropriate UX
- Support system themes (dark mode, dynamic color)
- Adapt to screen sizes (phone, tablet, foldable)

## Performance

- Lazy load screens and heavy widgets
- Use pagination for long lists
- Cache images with proper memory management
- Minimize main thread work (use isolates/workers)
- Profile in release mode on real devices

## Security

- Store sensitive data in secure storage (Keychain/Keystore)
- Certificate pinning for API communication
- Obfuscate release builds
- Never log sensitive user data
- Validate all user input client-side and server-side

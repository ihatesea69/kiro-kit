# System Architecture

## Overview

This document describes the mobile application architecture following clean architecture principles with clear separation of concerns.

## Architecture Layers

```
+------------------+
| Presentation     |  Widgets, Screens, BLoC/Cubit
+------------------+
| Domain           |  Entities, Use Cases, Repository Interfaces
+------------------+
| Data             |  Repositories, Data Sources, DTOs
+------------------+
| Core             |  Utilities, Constants, Extensions
+------------------+
```

## Dependency Rule

Dependencies point inward. Outer layers depend on inner layers, never the reverse.

- Presentation depends on Domain
- Data depends on Domain (implements interfaces)
- Domain depends on nothing (pure business logic)

## State Management

- Pattern: BLoC (Business Logic Component)
- Events flow in, states flow out
- Unidirectional data flow
- States are immutable value objects

## Navigation

- Declarative routing with go_router
- Type-safe route parameters
- Deep link support
- Authentication guards at router level

## Data Flow

1. User interaction triggers UI event
2. BLoC receives event, calls use case
3. Use case orchestrates repository calls
4. Repository fetches from remote or local source
5. Result propagates back as new state
6. UI rebuilds based on new state

## Platform Integration

- Platform channels for native features
- Abstracted behind interfaces for testability
- Graceful degradation when features unavailable

## Offline Strategy

- Local database as primary data source
- Background sync when connectivity available
- Conflict resolution: last-write-wins with user notification
- Queue-based operation replay for mutations

## Security

- Secure storage for credentials (Keychain/Keystore)
- Certificate pinning for API communication
- Code obfuscation in release builds
- No sensitive data in logs or crash reports

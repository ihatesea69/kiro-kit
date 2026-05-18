---
name: offline-first
description: Implement offline-first architecture with local storage, sync strategies, and conflict resolution. Use when building apps that must work without network connectivity.
---

# Offline First

Activate this skill when implementing offline-capable mobile features.

## When to Use

- Designing data persistence strategy
- Implementing local-first data storage
- Building sync mechanisms with remote servers
- Handling conflict resolution for concurrent edits
- Implementing optimistic updates with rollback
- Caching network responses for offline access

## Storage Options

- SQLite (drift/sqflite): relational data, complex queries
- Hive: fast key-value, good for settings and small datasets
- Isar: NoSQL, good for large datasets with indexing
- SharedPreferences: simple key-value for settings
- Secure storage: credentials and tokens

## Sync Strategies

- Queue-based: store operations, replay when online
- Timestamp-based: last-write-wins with conflict detection
- CRDT-based: conflict-free for collaborative data
- Delta sync: send only changes since last sync

## Rules

- Always design for offline-first, online as enhancement
- Handle sync conflicts explicitly (never silently overwrite)
- Show clear UI indicators for sync status
- Implement retry with exponential backoff
- Test with airplane mode and intermittent connectivity
- Encrypt sensitive data stored locally

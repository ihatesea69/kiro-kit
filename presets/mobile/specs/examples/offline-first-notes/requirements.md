# Requirements Document

## Introduction

This document defines the requirements for the **Offline-First Notes** feature of the cross-platform mobile application built with React Native. The feature enables users to create, read, update, and delete personal notes at any time — including when the device has no network connectivity — with automatic background synchronization to a remote API when connectivity is restored.

The guiding principle is **local-first**: every user action is committed to the on-device SQLite database (via WatermelonDB) before any network call is made. The remote API is treated as an eventually-consistent replica, not the source of truth during active editing. Conflicts arising from concurrent edits (e.g., the same note edited on two devices while offline) are resolved deterministically using last-write-wins semantics backed by logical timestamps (Lamport clocks per note), with the full version-vector history preserved for auditing.

## Glossary

| Term | Definition |
|------|------------|
| **Note** | A user-authored record consisting of a title, body text, and metadata (timestamps, version, sync state). |
| **Local DB** | The on-device WatermelonDB/SQLite database that serves as the primary read/write store. |
| **Remote API** | The RESTful backend service that stores the authoritative cloud copy of all notes. |
| **Sync Queue** | An ordered list of pending local mutations (create, update, delete) that have not yet been confirmed by the Remote API. |
| **Sync Engine** | The background service responsible for draining the Sync Queue and reconciling remote changes with local state. |
| **Conflict** | A state where both the local and remote versions of a note have been independently mutated since the last successful sync. |
| **LWW** | Last-Write-Wins — a conflict-resolution strategy where the mutation with the highest logical timestamp is retained. |
| **Version Vector** | A per-note data structure recording the logical clock value for each device that has ever edited the note, used to detect and characterize conflicts. |
| **Optimistic Update** | A UI technique where the interface reflects a mutation immediately, before the backend confirms it. |
| **Sync Status** | A UI indicator communicating whether a note is fully synced, pending sync, or in a conflict/error state. |
| **Tombstone** | A soft-delete marker retained in the local DB so the Sync Engine knows to propagate the deletion to the remote. |

## Requirements

### Requirement 1: Local CRUD Operations

**User Story:** As a mobile app user, I want to create, view, edit, and delete my notes without requiring a network connection, so that I can capture and manage information in any environment including airplane mode or areas with no coverage.

#### Acceptance Criteria

1. WHEN the user submits a new note with a non-empty title, THE SYSTEM SHALL persist the note to the local WatermelonDB database and display it in the notes list within 100 milliseconds, regardless of network availability.
2. WHEN the user opens an existing note, THE SYSTEM SHALL render its current local content within 150 milliseconds from navigation initiation.
3. WHEN the user saves an edit to a note body or title, THE SYSTEM SHALL overwrite the local record, increment the note's local version counter, record the device's logical clock value in the note's version vector, and update the `updatedAt` timestamp before returning control to the UI.
4. WHEN the user deletes a note, THE SYSTEM SHALL replace the local record with a tombstone entry (marking `deletedAt` and `syncStatus = 'pending_delete'`) so that the deletion can be propagated during the next sync, and THE SYSTEM SHALL remove the note from all UI lists immediately.
5. IF the user attempts to save a note with an empty title AND an empty body, THEN THE SYSTEM SHALL reject the save action and display an inline validation error without modifying the database.
6. WHILE the device is offline, THE SYSTEM SHALL allow unlimited create, edit, and delete operations, queuing each as a SyncQueueEntry for future processing.

---

### Requirement 2: Background Synchronization

**User Story:** As a mobile app user, I want my notes to synchronize automatically with the cloud whenever I am online, so that my data is backed up and available across all my devices without manual intervention.

#### Acceptance Criteria

1. WHEN the device transitions from offline to online, THE SYSTEM SHALL begin processing the Sync Queue within 3 seconds of the connectivity change being detected.
2. WHEN the Sync Engine processes a SyncQueueEntry of type `create`, THE SYSTEM SHALL POST the note payload to `POST /api/v1/notes` and, on a `201 Created` response, mark the entry as `synced` and update the local record's `remoteId` and `syncStatus`.
3. WHEN the Sync Engine processes a SyncQueueEntry of type `update`, THE SYSTEM SHALL send a `PATCH /api/v1/notes/:remoteId` request with the note payload and current version vector, and on a `200 OK` response, mark the entry as `synced`.
4. WHEN the Sync Engine processes a SyncQueueEntry of type `delete`, THE SYSTEM SHALL send a `DELETE /api/v1/notes/:remoteId` request and, on a `204 No Content` response, permanently remove the tombstone from the local DB.
5. WHEN the device is online and the Sync Queue is empty, THE SYSTEM SHALL poll `GET /api/v1/notes?since=<lastPullTimestamp>` at most every 60 seconds to pull remote changes made by other devices.
6. WHEN the Sync Engine successfully processes all pending SyncQueueEntries, THE SYSTEM SHALL update the `lastSyncedAt` timestamp stored in AsyncStorage and emit a sync-complete event to update the UI.
7. IF the app is terminated by the OS while a sync is in progress, THEN THE SYSTEM SHALL resume processing the same Sync Queue entries (which were not yet marked `synced`) on the next app launch, ensuring no data loss.

---

### Requirement 3: Conflict Resolution

**User Story:** As a user who edits notes on multiple devices, I want conflicts between local and remote versions to be resolved automatically using clear rules, so that I never lose data and I understand what happened to my content.

#### Acceptance Criteria

1. WHEN the Sync Engine sends an update for a note and the Remote API responds with `409 Conflict` (indicating a concurrent remote edit), THE SYSTEM SHALL fetch the remote version, compare logical timestamps from both version vectors, and apply Last-Write-Wins: the version with the higher `updatedAt` logical clock value SHALL become the canonical content.
2. WHEN LWW resolution selects the remote version over a local edit, THE SYSTEM SHALL overwrite the local record with the remote content, update the version vector by merging both vectors (taking the max value per device key), clear the conflicting SyncQueueEntry, and surface a transient "Note updated from another device" toast notification to the user.
3. WHEN LWW resolution selects the local version over the remote version, THE SYSTEM SHALL re-issue the `PATCH` request with a `force: true` flag and the merged version vector so the remote is overwritten.
4. WHEN a note has been edited locally while offline AND the same note has been deleted on the remote server (responding with `404 Not Found` on sync), THEN THE SYSTEM SHALL treat the local edit as authoritative, re-create the note on the remote via `POST /api/v1/notes`, assign it a new `remoteId`, and mark the sync status as `synced`.
5. WHEN a note has been deleted locally (tombstone) AND the remote server returns the note as modified (i.e., the remote `updatedAt` is newer than the local `deletedAt`), THEN THE SYSTEM SHALL restore the note locally from the remote version, remove the tombstone, and display the restored note in the list with a "Restored from cloud" badge.
6. WHERE two version vectors are equal (identical clock values for all devices), THE SYSTEM SHALL consider the versions identical and skip the conflict-resolution path entirely.

---

### Requirement 4: Optimistic UI and Sync Status Indicators

**User Story:** As a user, I want the app to feel instant for all note operations and to clearly show me which notes are pending sync or have encountered errors, so that I always understand the state of my data.

#### Acceptance Criteria

1. WHEN the user performs any create, update, or delete action, THE SYSTEM SHALL reflect the change in the UI immediately (before any network call completes), using the local DB as the UI source of truth via WatermelonDB's reactive observers.
2. WHEN a note has one or more unprocessed SyncQueueEntries, THE SYSTEM SHALL display a pending-sync indicator (a clock icon) on the note's list row and detail screen header.
3. WHEN a note is fully synced (no pending SyncQueueEntries and `syncStatus = 'synced'`), THE SYSTEM SHALL display a cloud-check icon on the note's detail screen header.
4. WHEN a SyncQueueEntry has failed more than 3 consecutive attempts, THE SYSTEM SHALL mark the note's `syncStatus` as `sync_error` and display a warning icon with a "Tap to retry" affordance on the note's list row.
5. WHEN the user taps the "Tap to retry" affordance on a note with `sync_error` status, THE SYSTEM SHALL reset the entry's retry counter to 0 and immediately attempt to re-process that entry.
6. WHILE the Sync Engine is actively uploading or downloading changes, THE SYSTEM SHALL display a global sync-in-progress indicator in the navigation bar (animated spinner with "Syncing…" label).
7. WHEN the device is offline, THE SYSTEM SHALL display a persistent "Offline — changes saved locally" banner at the top of the notes list, and THE SYSTEM SHALL hide the banner within 2 seconds of connectivity being restored and a sync cycle completing.

---

### Requirement 5: Connectivity Detection

**User Story:** As a user, I want the app to detect network changes automatically and react without requiring me to manually trigger a sync, so that the experience is seamless and I never have to think about connectivity state.

#### Acceptance Criteria

1. WHEN the app launches, THE SYSTEM SHALL query the current network state using `@react-native-community/netinfo` within 500 milliseconds of the root component mounting and update the connectivity context accordingly.
2. WHEN the device transitions from an online state to an offline state, THE SYSTEM SHALL pause any in-flight sync requests (allowing the current HTTP request to complete or time out) and set the Sync Engine state to `paused`.
3. WHEN the device transitions from offline to online, THE SYSTEM SHALL set the Sync Engine state to `running` and trigger an immediate Sync Queue drain cycle, bypassing the 60-second poll interval.
4. IF the device reports connectivity but the Remote API is unreachable (e.g., DNS failure, TLS error, or a response time exceeding 10 seconds), THEN THE SYSTEM SHALL treat this as an effective offline state for sync purposes, increment the retry backoff, and not update the UI connectivity banner.
5. WHERE the app is backgrounded by the OS (React Native background state), THE SYSTEM SHALL rely on a registered background task (via `react-native-background-fetch`) to attempt one sync cycle every 15 minutes, subject to OS scheduling constraints.

---

### Requirement 6: Sync Failure and Retry

**User Story:** As a user, I want failed sync attempts to be retried automatically with sensible back-off, so that transient network errors do not result in permanent data loss or require my intervention.

#### Acceptance Criteria

1. WHEN a sync request fails with a network error or a `5xx` server response, THE SYSTEM SHALL schedule a retry using truncated exponential backoff: delays of 5 s, 10 s, 20 s, 40 s, up to a ceiling of 5 minutes, with ±10% jitter applied to each interval.
2. WHEN a sync request fails with a `4xx` client error (excluding `404` and `409`, which have dedicated handling in R3), THE SYSTEM SHALL mark the SyncQueueEntry as `sync_error`, log the response body for diagnostics, and NOT retry automatically, requiring explicit user action.
3. WHEN a sync request has been retried more than 3 times within a single app session, THE SYSTEM SHALL set the note's `syncStatus` to `sync_error` and surface the error indicator described in R4.4.
4. WHEN the Sync Engine is retrying a failed entry and the device goes offline before the retry fires, THE SYSTEM SHALL cancel the pending retry timer and resume the backoff sequence from the same delay when the device comes back online.
5. IF the Sync Queue contains more than 500 entries (indicative of an extended offline period), THEN THE SYSTEM SHALL process entries in batches of 50, yielding between batches to avoid blocking the JS thread, and update the global sync progress indicator with a percentage complete.

---

### Requirement 7: Data Integrity and Performance

**User Story:** As a developer and as a user, I want the notes data to remain consistent and the app to remain responsive at all times, so that users can trust their data and the app feels native-quality even with thousands of notes.

#### Acceptance Criteria

1. WHEN writing to the local WatermelonDB database, THE SYSTEM SHALL execute all mutations within a single WatermelonDB batch transaction to ensure atomicity; if any part of the batch fails, THE SYSTEM SHALL roll back the entire transaction and surface an error to the user.
2. WHEN the notes list contains up to 10,000 notes, THE SYSTEM SHALL render the list with virtualization (FlatList with `initialNumToRender=15` and `windowSize=5`) and maintain a frame rate of at least 55 FPS during scroll.
3. WHEN the Sync Engine fetches remote changes, THE SYSTEM SHALL apply them to the local DB within a single WatermelonDB batch to prevent partial state from being observable by the UI.
4. WHERE a note body exceeds 50,000 characters, THE SYSTEM SHALL store the body in a dedicated large-text column and load it lazily (only when the note detail screen is opened), excluding it from the list query projection.
5. WHEN the app is uninstalled and reinstalled, THE SYSTEM SHALL be able to fully recover all synced notes by pulling from the Remote API on first launch, achieving parity with the remote state within one sync cycle.
6. WHERE the local DB schema changes between app versions, THE SYSTEM SHALL execute WatermelonDB schema migrations automatically on first launch after update, without data loss and without requiring a full re-sync.

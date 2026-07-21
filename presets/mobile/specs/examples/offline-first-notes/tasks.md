# Implementation Plan: Offline-First Notes

## Overview

This plan implements the Offline-First Notes feature for a React Native application. Tasks are ordered so that each layer is fully testable before the next layer depends on it: database schema first, then the repository, then the sync engine, then UI. Every top-level task ends with a traceability link to the requirements it satisfies.

**Key libraries:**
- `@nozbe/watermelondb` — local database with reactive queries
- `@react-native-community/netinfo` — connectivity detection
- `react-native-background-fetch` — background sync scheduling
- `axios` — HTTP client (with `axios-mock-adapter` in tests)
- `zustand` — transient UI / engine state
- `uuid` — device ID and local note ID generation
- `@sentry/react-native` — error and log reporting

**Estimated effort:** ~10 developer-days for a single engineer.

---

## Tasks

- [ ] 1. Project setup and database foundation
  - [ ] 1.1 Install WatermelonDB and its native SQLite adapter: `npm install @nozbe/watermelondb @nozbe/with-observables` and run `npx pod-install` for iOS; link the Android JSI adapter.
  - [ ] 1.2 Define the WatermelonDB schema in `src/db/schema.ts` with the `notes` table (columns: `remote_id`, `title`, `body`, `sync_status`, `version_vector`, `local_version`, `deleted_at`, `created_at`, `updated_at`) and the `sync_queue` table (columns: `note_id`, `remote_id`, `operation`, `payload`, `retry_count`, `last_error`, `status`, `created_at`).
  - [ ] 1.3 Create `src/db/models/Note.ts` extending `Model` with all field decorators and the `VersionVector` type alias as specified in the design.
  - [ ] 1.4 Create `src/db/models/SyncQueueEntry.ts` extending `Model` with all field decorators.
  - [ ] 1.5 Initialize the WatermelonDB `Database` instance in `src/db/index.ts` using the `SQLiteAdapter` with the schema; export the singleton `database`.
  - [ ] 1.6 Wrap `App.tsx` root with `<DatabaseProvider database={database}>` so all screens can access WatermelonDB via context.
  - [ ] 1.7* Write unit tests for the schema: verify table names, column names, and types are correct using WatermelonDB's test helpers with a `MockDatabase`.
  - _Requirements: R1.1, R7.1, R7.6_

- [ ] 2. Device identity and sync metadata
  - [ ] 2.1 On first app launch, generate a UUID v4 `deviceId` and persist it to `AsyncStorage` under the key `@notes/deviceId`; subsequent launches read it from storage.
  - [ ] 2.2 Create `src/sync/SyncMetadata.ts` with typed read/write helpers for `lastPullTimestamp`, `lastSyncedAt`, and `deviceId` in `AsyncStorage`.
  - [ ] 2.3 Export a `getDeviceId()` async function used by the repository and sync engine when stamping version vectors.
  - [ ] 2.4* Write unit tests for `SyncMetadata` helpers using a mocked `AsyncStorage` (`@react-native-async-storage/async-storage/jest/async-storage-mock`).
  - _Requirements: R2.6, R3.1, R3.3_

- [ ] 3. Note repository
  - [ ] 3.1 Create `src/repositories/NoteRepository.ts` as a class that takes the `Database` instance; implement `create(draft: NoteDraft): Promise<Note>` — executes a `database.write()` batch that creates a `Note` record with `syncStatus='pending_create'` and a corresponding `SyncQueueEntry` with `operation='create'`.
  - [ ] 3.2 Implement `update(id: string, patch: Partial<NoteDraft>): Promise<Note>` — within a single `database.write()` batch, update the `Note` record (increment `localVersion`, update `versionVector[deviceId]`, set `syncStatus='pending_update'`, update `updatedAt`) and upsert a `SyncQueueEntry` with `operation='update'` (replacing any existing pending update entry for the same note to avoid duplicate queue entries).
  - [ ] 3.3 Implement `delete(id: string): Promise<void>` — within a single `database.write()` batch, mark the `Note` with `deletedAt=Date.now()` and `syncStatus='pending_delete'`, and create a `SyncQueueEntry` with `operation='delete'`. The note is immediately excluded from `observeAll()` by adding a `where('deleted_at').eq(null)` clause.
  - [ ] 3.4 Implement `observeAll(): Observable<Note[]>` using WatermelonDB's `.observe()` on the notes collection, filtered to exclude tombstones (`deleted_at IS NULL`) and ordered by `updated_at DESC`.
  - [ ] 3.5 Implement `observeById(id: string): Observable<Note>` using `.observe()` on a single record.
  - [ ] 3.6 Implement `applyRemoteChanges(changes: RemoteChangeSet): Promise<void>` — within a single `database.write()` batch, upsert each `RemoteNote` into the local `notes` table. For each remote note: if a local record with matching `remote_id` exists and has no pending queue entries, update it; if the remote note has a non-null `deletedAt`, apply the tombstone locally; if no local record exists, create one with `syncStatus='synced'`.
  - [ ] 3.7* Write unit tests for each repository method using `@nozbe/watermelondb` with a `LokiJSAdapter` (in-memory, no native module needed) or WatermelonDB's test `MockDatabase`. Assert: (a) Note record state after each operation; (b) SyncQueueEntry created in the same transaction; (c) `observeAll` excludes tombstones; (d) `applyRemoteChanges` does not create queue entries for remote-initiated changes.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R2.3, R2.4, R7.1, R7.3_

- [ ] 4. Connectivity detection
  - [ ] 4.1 Install `@react-native-community/netinfo` and run `npx pod-install`.
  - [ ] 4.2 Create `src/stores/connectivityStore.ts` as a Zustand store with `isOnline: boolean` and `isApiReachable: boolean` state, and `setOnline` / `setApiReachable` actions.
  - [ ] 4.3 Create `src/connectivity/ConnectivityService.ts` that subscribes to `NetInfo.addEventListener` on init and calls `connectivityStore.setOnline()` on each state change; expose a `start()` and `stop()` method.
  - [ ] 4.4 In `ConnectivityService`, implement `checkApiReachability()`: send a `HEAD` request to `/api/v1/health` with a 10-second timeout; on success, call `setApiReachable(true)`; on failure (network error or timeout), call `setApiReachable(false)` without updating `isOnline`.
  - [ ] 4.5 Call `ConnectivityService.start()` in `App.tsx` within a `useEffect` on mount; call `stop()` on unmount.
  - [ ] 4.6 Create `src/hooks/useConnectivity.ts` that reads from `connectivityStore` and returns `{ isOnline, isApiReachable }`.
  - [ ] 4.7* Write unit tests for `ConnectivityService` by mocking `@react-native-community/netinfo`'s `addEventListener` and asserting store state after simulated transitions (online → offline → online).
  - _Requirements: R5.1, R5.2, R5.3, R5.4_

- [ ] 5. Sync engine — core queue drain
  - [ ] 5.1 Create `src/sync/SyncEngine.ts` as a singleton class with state `'idle' | 'draining' | 'paused' | 'error'`; expose `boot()`, `pause()`, `resume()`, and `triggerDrain()` methods; update `syncStore.engineStatus` on each transition.
  - [ ] 5.2 Implement `SyncEngine.boot()`: reset any `sync_queue` entries with `status='processing'` back to `status='pending'` (handles OS-kill-mid-sync recovery); then call `triggerDrain()` if online, else set state to `paused`.
  - [ ] 5.3 Implement `triggerDrain()`: query all `sync_queue` entries with `status='pending'` ordered by `created_at ASC`; process them in batches of 50 using a `for` loop with `await setImmediate()` between batches (implemented as `new Promise(r => setImmediate(r))`); update `syncStore.progressPercent` after each batch.
  - [ ] 5.4 Implement the `create` operation handler: POST the payload to `/api/v1/notes`; on 201, batch-update the local `Note.remoteId`, `Note.syncStatus='synced'`, and delete the queue entry; update the `SyncQueueEntry.remoteId` so subsequent operations use the correct remote ID.
  - [ ] 5.5 Implement the `update` operation handler: PATCH `/api/v1/notes/:remoteId` with the payload and `versionVector`; on 200, batch-update the local `Note.syncStatus='synced'` and `Note.versionVector` and delete the queue entry; delegate 409 to the conflict resolver (Task 6) and 404 to the re-create path (Task 7).
  - [ ] 5.6 Implement the `delete` operation handler: DELETE `/api/v1/notes/:remoteId`; on 204 or 404 (idempotent), permanently delete the tombstone note record and the queue entry in a single batch.
  - [ ] 5.7 After the queue drain completes, call `SyncEngine.pull()` to fetch remote changes: GET `/api/v1/notes?since=<lastPullTimestamp>`, call `noteRepository.applyRemoteChanges()`, update `SyncMetadata.lastPullTimestamp`, update `SyncMetadata.lastSyncedAt`, and dispatch `syncStore.setLastSyncedAt()`.
  - [ ] 5.8 Subscribe to `connectivityStore` in `SyncEngine`; on `isOnline` transitioning to `true`, call `triggerDrain()` immediately (bypasses 60 s poll); on `isOnline` transitioning to `false`, set state to `paused`.
  - [ ] 5.9 Set up a 60-second interval in `SyncEngine` that calls `triggerDrain()` when state is `idle` and `isOnline` is `true`, to pull remote changes from other devices.
  - [ ] 5.10* Write unit tests for `SyncEngine` using `axios-mock-adapter` to simulate each response code (201, 200, 204, 404, 409, 500) and asserting: (a) correct Local DB state after each handler; (b) correct queue entry state; (c) state machine transitions; (d) `boot()` resets processing entries.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7, R5.2, R5.3, R6.5_

- [ ] 6. Conflict resolution
  - [ ] 6.1 Create `src/sync/conflictResolver.ts` exporting a pure function `resolveConflict(local: Note, remote: RemoteNote, deviceId: string): ConflictResolution` where `ConflictResolution = { winner: 'local' | 'remote'; mergedVector: VersionVector; winnerContent: { title: string; body: string; updatedAt: string } }`.
  - [ ] 6.2 Implement LWW logic in `resolveConflict`: compare `local.updatedAt.getTime()` vs `new Date(remote.updatedAt).getTime()`; remote wins on tie; compute `mergedVector` by taking `Math.max` for every device key across both vectors.
  - [ ] 6.3 In `SyncEngine`, when a PATCH returns 409, extract the `remoteNote` from the response body, call `resolveConflict()`, then: if local wins, re-issue PATCH with `{ ...localPayload, force: true, versionVector: mergedVector }`; if remote wins, apply the remote content to the local DB in a batch (overwrite title, body, versionVector, syncStatus='synced') and delete the queue entry, then emit a toast event with message "Note updated from another device".
  - [ ] 6.4 Handle the edit-then-remote-delete scenario in `SyncEngine.update`: if PATCH returns 404, POST the local note as a new record (`/api/v1/notes`); on 201, update local `Note.remoteId` and `syncStatus='synced'`.
  - [ ] 6.5 Handle the delete-then-remote-edit scenario in `SyncEngine.delete`: if DELETE returns 409 (optional server support) or if the pull step returns the "deleted" note as modified (remote `updatedAt` > local `deletedAt`), restore the note locally: remove tombstone (set `deletedAt=null`, `syncStatus='synced'`), update content with remote version, emit a toast event with message "Note restored from cloud".
  - [ ] 6.6* Write pure unit tests for `resolveConflict` covering: local wins (higher timestamp), remote wins (higher timestamp), tie-breaking (remote preferred), equal version vectors (both return identical content), merged vector correctness with multiple device keys.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6_

- [ ] 7. Retry and backoff
  - [ ] 7.1 Create `src/sync/retryPolicy.ts` exporting `computeRetryDelay(retryCount: number): number` implementing truncated exponential backoff: `BASE=5000ms`, `CEILING=300000ms`, jitter of ±10% using `Math.random()`.
  - [ ] 7.2 In `SyncEngine`, when a transient error (network error or 5xx) is caught for a queue entry: increment `SyncQueueEntry.retryCount`, set `SyncQueueEntry.lastError` to the error message, schedule the next drain attempt using `setTimeout(triggerDrain, computeRetryDelay(retryCount))`.
  - [ ] 7.3 If `SyncQueueEntry.retryCount > 3`, mark `SyncQueueEntry.status='error'` and update the associated `Note.syncStatus='sync_error'`; exclude this entry from the current drain batch.
  - [ ] 7.4 For non-retriable 4xx errors (all 4xx except 404 and 409): mark `SyncQueueEntry.status='error'` and `Note.syncStatus='sync_error'` immediately without scheduling a retry.
  - [ ] 7.5 When `isOnline` transitions to `false` during a scheduled retry timeout, cancel the pending `setTimeout` handle (stored as `this.retryTimer`) to avoid firing while offline.
  - [ ] 7.6* Write unit tests for `computeRetryDelay`: assert outputs are within the bounded ±10% jitter range for `retryCount` 0 through 6, and that the result never exceeds `CEILING * 1.1`.
  - [ ] 7.7* Write unit tests for the retry orchestration in `SyncEngine`: mock timers with `jest.useFakeTimers()`; assert retry is scheduled on 500 error, cancelled on offline transition, and that entries exceeding 3 retries are excluded from drain.
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R5.2_

- [ ] 8. Background sync
  - [ ] 8.1 Install `react-native-background-fetch` and configure native modules (iOS: add `BGProcessingTaskIdentifier` to `Info.plist`; Android: add `BackgroundFetch` service to `AndroidManifest.xml`).
  - [ ] 8.2 In `SyncEngine.boot()`, register a `BackgroundFetch` task under the identifier `com.notes.sync`: on each invocation, call `triggerDrain()` if `isOnline`, then call `BackgroundFetch.finish()` to signal OS completion; configure `minimumFetchInterval=15` (minutes).
  - [ ] 8.3 Ensure `SyncEngine` re-reads `ConnectivityStore.isOnline` synchronously at the start of each background task invocation (the NetInfo state may have changed since the last foreground session).
  - _Requirements: R5.5, R2.7_

- [ ] 9. Zustand stores and sync context
  - [ ] 9.1 Create `src/stores/syncStore.ts` with the `SyncStore` interface: `engineStatus`, `progressPercent`, `lastSyncedAt`, and their setters as defined in the design.
  - [ ] 9.2 Create `src/hooks/useSyncStatus.ts` that reads from `syncStore` and returns `{ engineStatus, progressPercent, lastSyncedAt }`.
  - [ ] 9.3 Create `src/hooks/useNotes.ts` that wraps `noteRepository.observeAll()` in a `useObservable` hook (from `@nozbe/with-observables`) and returns the reactive `Note[]` array.
  - [ ] 9.4 Create `src/hooks/useNote.ts(id)` that wraps `noteRepository.observeById(id)` in `useObservable` and returns the reactive `Note | undefined`.
  - [ ] 9.5 Create a `ToastService` singleton that Zustand subscribers (and the sync engine) use to push toast messages to a queue; a `<ToastRenderer />` component drains the queue with `react-native`'s `Animated` API.
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.6, R3.2, R3.5_

- [ ] 10. Note list screen
  - [ ] 10.1 Create `src/screens/NoteListScreen.tsx`; use `useNotes()` hook to subscribe to the reactive note list; render a `FlatList` with `initialNumToRender=15`, `windowSize=5`, `keyExtractor={item => item.id}`, and a `NoteListRow` component per item.
  - [ ] 10.2 Create `src/components/NoteListRow.tsx` displaying title, a 2-line body snippet (first 120 characters), a formatted `updatedAt` relative timestamp, and a `SyncStatusBadge`.
  - [ ] 10.3 Create `src/components/SyncStatusBadge.tsx` as a pure component mapping `Note.syncStatus` to an icon: `pending_*` → clock icon (`⏱`), `synced` → cloud-check icon (`☁✓`), `sync_error` → warning icon (`⚠`) with "Tap to retry" label. Tapping the error badge calls `syncEngine.retryEntry(noteId)` which resets `retryCount=0` and triggers `triggerDrain()`.
  - [ ] 10.4 Add a FAB (Floating Action Button) that navigates to `NoteDetailScreen` in create mode.
  - [ ] 10.5 Implement swipe-to-delete on `NoteListRow` using `react-native-gesture-handler`'s `Swipeable`; on confirm, call `noteRepository.delete(note.id)`.
  - [ ] 10.6 Create `src/components/ConnectivityBanner.tsx` that reads `useConnectivity().isOnline`; when `false`, renders a persistent yellow banner "Offline — changes saved locally"; when `true`, hides after a 2-second delay (animated fade-out).
  - [ ] 10.7 Mount `<ConnectivityBanner />` above the `FlatList` in `NoteListScreen`.
  - [ ] 10.8* Write React Native Testing Library tests for `NoteListScreen`: mock `useNotes` to return a list of notes with varying `syncStatus` values; assert correct badges render; assert swipe-to-delete calls `noteRepository.delete`.
  - _Requirements: R4.1, R4.2, R4.4, R4.5, R4.7, R7.2_

- [ ] 11. Note detail screen
  - [ ] 11.1 Create `src/screens/NoteDetailScreen.tsx`; accept `noteId` as a route param (or `undefined` for create mode); use `useNote(noteId)` to subscribe to the reactive note.
  - [ ] 11.2 Render a `TextInput` for the title and a multi-line `TextInput` for the body; both inputs are controlled by local `useState` initialized from the note's current values.
  - [ ] 11.3 Implement 500 ms debounced auto-save: on each keystroke, restart a `useRef`-backed timer; when it fires, validate that title or body is non-empty (else show inline error and skip save), then call `noteRepository.update(noteId, { title, body })` or `noteRepository.create({ title, body })` for new notes.
  - [ ] 11.4 Display `<SyncStatusBadge note={note} />` in the screen's navigation header (right side), updating reactively as `note.syncStatus` changes.
  - [ ] 11.5 Add a delete button in the navigation header (left side with confirmation `Alert`); on confirm, call `noteRepository.delete(noteId)` and navigate back to the list.
  - [ ] 11.6* Write React Native Testing Library tests: assert auto-save fires after debounce, validate empty-note rejection, assert `SyncStatusBadge` updates when note observable emits a new value.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R4.1, R4.2, R4.3_

- [ ] 12. Global sync status indicator
  - [ ] 12.1 Create `src/components/GlobalSyncIndicator.tsx` that reads `useSyncStatus().engineStatus`; when `'draining'`, render an `ActivityIndicator` with "Syncing…" label positioned in the navigation bar via `useLayoutEffect` and `navigation.setOptions`.
  - [ ] 12.2 When `engineStatus` is `'draining'` and `progressPercent` is non-null, render a progress percentage alongside the spinner (e.g., "Syncing… 42%") to support large-queue scenarios (R6.5).
  - [ ] 12.3 Mount `<GlobalSyncIndicator />` in `NoteListScreen`'s `useLayoutEffect` to inject it into the navigation header.
  - _Requirements: R4.6, R6.5_

- [ ] 13. Large note body lazy loading
  - [ ] 13.1 Modify `noteRepository.observeAll()` to project only `['id', 'remote_id', 'title', 'sync_status', 'version_vector', 'local_version', 'deleted_at', 'created_at', 'updated_at']`, explicitly excluding `body` from the list query using WatermelonDB's `observeWithColumns`.
  - [ ] 13.2 In `NoteDetailScreen`, use a separate `noteRepository.observeById(id)` call (which includes `body`) to load the full content only when the detail screen mounts; show a `<ActivityIndicator />` while the body loads.
  - [ ] 13.3 Add a DB-level check in `noteRepository.update()`: if the new body exceeds 50,000 characters, store a truncated preview (first 200 chars) in a separate `body_preview` column (add migration for this column) and the full content in `body`; update `observeAll()` to use `body_preview` for list rows.
  - _Requirements: R7.4_

- [ ] 14. Schema migrations
  - [ ] 14.1 Create `src/db/migrations.ts` with WatermelonDB's `schemaMigrations` export; define migration from version 1 → 2 that adds the `body_preview` column to `notes` (as implemented in Task 13.3).
  - [ ] 14.2 Pass `migrations` to the `SQLiteAdapter` constructor in `src/db/index.ts`; WatermelonDB runs migrations automatically on app launch when the schema version has changed.
  - [ ] 14.3* Write a migration test: start a `MockDatabase` at schema version 1, run the migration, assert the `body_preview` column exists and existing notes have an empty `body_preview` (not null).
  - _Requirements: R7.6_

- [ ] 15. End-to-end integration and Detox tests
  - [ ] 15.1 Set up Detox with a React Native test runner; configure mock API server (`msw` with a React Native adapter) that intercepts `axios` requests in the test environment.
  - [ ] 15.2* Write Detox test: "offline create syncs on reconnect" — disable network, create note, enable network, assert mock API received `POST /api/v1/notes` with correct payload and note shows cloud-check badge.
  - [ ] 15.3* Write Detox test: "conflict LWW remote wins" — create note, sync it, mock API to return 409 with newer remote version, trigger sync, assert note content updates to remote version and toast "Note updated from another device" is visible.
  - [ ] 15.4* Write Detox test: "edit then server delete" — create and sync note, mock API to return 404 on PATCH, trigger sync, assert note is re-POSTed and remains visible locally.
  - [ ] 15.5* Write Detox test: "app-kill resume" — create note offline, force-quit app (Detox `device.terminate()`), relaunch, enable network, assert Sync Queue resumes and note eventually syncs.
  - [ ] 15.6* Write Detox test: "large queue batching" — seed 600 SyncQueueEntries via direct DB access, trigger drain, assert progress indicator shows percentage and all entries eventually sync without app becoming unresponsive (monitor via `device.getPlatform()` frame-drop heuristics).
  - [ ] 15.7* Write Detox test: "connectivity banner" — disable network, navigate to list screen, assert "Offline" banner visible; enable network, wait 2 s, assert banner hidden.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7_

- [ ] 16. Performance validation and polish
  - [ ] 16.1 Run the notes list with 10,000 seeded notes (via a dev-mode DB seeder script) and measure FPS using Flipper's React Native Performance plugin; confirm ≥55 FPS during scroll.
  - [ ] 16.2 Profile local write latency using `performance.now()` before and after `noteRepository.create()` in a dev build; assert p99 < 100 ms on a mid-range Android device (e.g., Pixel 4a).
  - [ ] 16.3 Validate `getItemLayout` is implemented on `NoteListScreen`'s `FlatList` for fixed-height rows to eliminate layout measurement overhead during scroll.
  - [ ] 16.4 Run Sentry sourcemap upload as part of the CI release pipeline; ensure all error events from production builds include readable stack traces.
  - _Requirements: R7.2, R1.1_

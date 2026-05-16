# How It Works

## The Preset Model

A preset is a self-contained collection of Kiro IDE configuration files. Each
preset targets a specific development context (frontend, backend, mobile, etc.)
and includes everything needed for an engineer-grade workspace:

- Agents (AI assistant personas with specialized knowledge)
- Skills (reusable capability modules)
- Commands (slash-command templates)
- Hooks (automation scripts triggered by IDE events)
- Workflows (always-on steering documents)
- Steering files (context-aware coding conventions)
- Settings, MCP server config, statusline scripts, spec templates

### Self-Contained Policy

Every preset is fully independent. There is no shared runtime dependency
between presets. If two presets include an agent with the same name (e.g.,
`code-reviewer.md`), each carries its own copy tailored to its domain.

This means:

- Installing one preset never requires another.
- Removing a preset has no side effects on others.
- Updates to one preset cannot break another.
- The tradeoff is increased package size, but it eliminates coupling.

## Lifecycle

### 1. Init

```bash
npx kiro-kit init
```

1. Interactive multi-pick prompt shows all 6 presets.
2. User selects one or more presets (space to toggle, `a` for all).
3. CLI displays file count summary and asks for confirmation.
4. For each file in the selected presets:
   - If target does not exist: write it.
   - If target exists with identical content: skip (no-op).
   - If target exists with different content: trigger conflict resolution.
5. Merge MCP servers into `.kiro/settings/mcp.json` (user-priority).
6. Merge settings into `.kiro/settings.json` (array dedup, last-write-wins).
7. Write tracking file (`.kiro/.kiro-kit.json`) last.
8. Print summary and exit.

### 2. Add

```bash
kiro-kit add backend
```

Same as init but for a single preset added to an existing workspace. If
`.kiro/` does not exist, delegates to the full init flow automatically.

### 3. Update

```bash
kiro-kit update
```

1. Read tracking file to find installed presets and their versions.
2. Compare against current bundled preset versions.
3. Identify changed files (content hash mismatch).
4. Apply conflict resolution for each changed file.
5. Bump version in tracking file.

If no presets are installed, exits cleanly. If network is unreachable (for
future remote preset support), warns and exits without error.

### 4. Restore

```bash
kiro-kit restore
```

1. List available backup timestamps from `.kiro/.backup/`.
2. Select the most recent (or a specific `--timestamp`).
3. Copy all backed-up files back to their original relative paths.
4. Backups are never deleted after restore (idempotent, safe to retry).

## Merge Semantics

### MCP Servers (`.kiro/settings/mcp.json`)

- User-priority: if a server name already exists, the user's definition is
  kept unchanged.
- New servers from the preset are added.
- No servers are ever removed.
- Cross-preset conflicts (same server name, different definition) produce a
  warning.

### Settings (`.kiro/settings.json`)

- **Array fields** (`hooks.PreToolUse`, `hooks.PostToolUse`, etc.): entries are
  concatenated and deduplicated by the `command` field. User entries come first.
- **Non-array fields** (`statusLine`, `includeCoAuthoredBy`): last-write-wins
  with a warning if the value differs from the existing one.
- **User-only fields**: any field the user added manually that is not in the
  preset schema is preserved untouched.

### Hook Files

- Deduplicated by filename (case-sensitive).
- If a hook file already exists with different content, it goes through the
  standard conflict resolution flow.
- User-created hooks (not in any preset manifest) are never touched.

## Conflict Resolution UX

When a file exists with different content and no `--force` or `--skip-existing`
flag is set, the CLI presents four options:

```
? File .kiro/agents/code-reviewer.md already exists with different content.
  > overwrite       - Replace existing file (backup will be saved)
    skip            - Keep existing file
    view diff       - Show unified diff and ask again
    overwrite all   - Replace this and all remaining conflicting files
```

- **overwrite**: backs up the existing file, then writes the new version.
- **skip**: leaves the existing file untouched.
- **view diff**: displays a colored unified diff, then re-prompts.
- **overwrite all**: sets a session flag so all subsequent conflicts are
  auto-overwritten (with backup).

Backups are stored at `.kiro/.backup/<YYYYMMDD-HHmmss-mmm>/<relative-path>`.

## Backup Strategy

- Every overwritten file is backed up before replacement.
- Backups preserve the full relative path structure.
- Timestamps are lexicographically sortable.
- Backups are never automatically deleted.
- `kiro-kit restore` copies files back from a backup timestamp.
- `kiro-kit restore --list` shows available backup points.

## Tracking

`.kiro/.kiro-kit.json` maintains the installation state:

- Which presets are installed and their versions.
- Every file written, with its target path, source preset, and content hash.
- Timestamps for install and last update.

This file is written only after all file operations complete successfully,
reducing the risk of inconsistent state on interruption.

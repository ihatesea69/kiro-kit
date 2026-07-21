# Native Kiro Agent Hooks

These `*.kiro.hook` files are **native Kiro Agent Hooks** — event-driven automation
that runs inside the Kiro IDE. They are Kiro's real hook format (JSON with a
`when` trigger and a `then` action), distinct from the cross-platform shell
notifier scripts (`.js`/`.sh`/`.ps1`) that also live in this folder.

## Enabling a hook

Every hook ships **disabled** (`"enabled": false`) so a fresh workspace never
triggers agent runs you didn't ask for. To turn one on, open it in the Kiro
**Agent Hooks** panel and toggle it, or set `"enabled": true` in the file.

## Credit note

- `then.type: "askAgent"` starts a new agent loop and **consumes credits**.
- `then.type: "runCommand"` runs a shell command and does **not** consume credits.

Prefer `askAgent` only for tasks that need reasoning; use the shell notifier
scripts or `runCommand` for deterministic checks.

## Shared hooks

- **Run Tests on Save** — When a test file is saved, run its suite and surface failures. Disabled by default (askAgent uses credits). (`fileEdited`)
- **Spec Task Sync** — When a spec tasks.md changes, reconcile checkbox state against the actual implementation and preserve requirement traceability. (`fileEdited`)
- **Secret Scan on Save** — When a code or config file is saved, scan it for hardcoded secrets. Scoped to file writes so it does not run on every tool call. (`fileEdited`)
- **Docs Drift Guard** — When source changes, update any README / API docs / steering that now reference stale symbols. Documentation-only edits. (`fileEdited`)

## data-ai domain hooks

- **Experiment Log** — When a notebook or training script changes, append a structured experiment log entry. (`fileEdited`)
- **Data Validation** — When a new dataset or loader is added, generate a schema/validation check. (`fileCreated`)
- **Model Card Update** — Manual model-card refresh capturing metrics, data, and intended use. (`userTriggered`)

## Triggers reference

`fileEdited`, `fileCreated`, `fileDeleted`, `userTriggered`, `promptSubmit`,
`agentStop`, `preToolUse`, `postToolUse`. File triggers take a `patterns` glob array.

See the [Kiro hooks docs](https://kiro.dev/docs/hooks/) for the full reference.

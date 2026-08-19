# Native Kiro Agent Hooks

These `.json` files are **native Kiro Agent Hooks** — event-driven automation that
runs inside the Kiro IDE. They use the **v1 schema** (Kiro IDE 1.0 / CLI 3.0), and
are distinct from the cross-platform shell notifier scripts (`.js`/`.sh`/`.ps1`)
that also live in this folder.

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Run Tests on Save",
      "enabled": false,
      "trigger": "PostFileSave",
      "matcher": "\.(test|spec)\.[^/]+$",
      "action": { "type": "agent", "prompt": "..." }
    }
  ]
}
```

## Enabling a hook

Every **agent** hook ships **disabled** (`"enabled": false`) so a fresh workspace
never triggers agent runs you didn't ask for. To turn one on, open it in the Kiro
**Agent Hooks** panel and toggle it, or set `"enabled": true` in the file.

The **script** hooks below ship **enabled** — they run local Node scripts, cost no
credits, and no-op when their environment variables are unset.

## Credit note

- `action.type: "agent"` starts a new agent loop and **consumes credits**.
- `action.type: "command"` runs a shell command and does **not** consume credits.

Prefer `agent` only for tasks that need reasoning; use the shell notifier
scripts or a `command` action for deterministic checks.

## Shared hooks

- **Run Tests on Save** — When a test file is saved, run its suite and surface failures. Disabled by default (agent actions use credits). (`PostFileSave`)
- **Spec Task Sync** — When a spec tasks.md changes, reconcile checkbox state against the actual implementation and preserve requirement traceability. (`PostFileSave`)
- **Secret Scan on Save** — When a code or config file is saved, scan it for hardcoded secrets. Scoped to file writes so it does not run on every tool call. (`PostFileSave`)
- **Docs Drift Guard** — When source changes, update any README / API docs / steering that now reference stale symbols. Documentation-only edits. (`PostFileSave`)

## devops domain hooks

- **Terraform Plan Review** — When Terraform changes, summarize the plan risks before apply. (`PostFileSave`)
- **Container Scan** — When a Dockerfile changes, review it for security and efficiency issues. (`PostFileSave`)

## Manual steering commands

0.x shipped these as `userTriggered` hooks. That trigger no longer exists, so they
now install as manual steering files in `.kiro/steering/` — run them by typing the
slash command in chat.

- `/deep-scan-stale` — Run on demand to check whether the last deep security scan is stale (>30 days) or predates significant source changes.
- `/cost-estimate` — Run on demand for an infrastructure cost estimate of the current IaC.

## Script hooks (enabled)

0.x registered these in `settings.json` under a `hooks` key. Kiro 1.0 reads hooks
only from `.kiro/hooks/*.json`, so they now ship as v1 `command` hooks. They cost
no credits and no-op when their env vars are unset — see `.env.example`.

- **Scout Block** — Blocks obviously-dangerous shell commands (rm -rf /, drop database) before a tool runs. Defense-in-depth, not a security boundary. (`PreToolUse`)
- **Modularization Hook** — Warns when an edited file grows past the 200-line guideline. (`PostToolUse`)
- **Discord Notify** — Sends a Discord notification when the agent finishes. No-ops unless DISCORD_WEBHOOK_URL is set. (`Stop`)
- **Telegram Notify** — Sends a Telegram notification when the agent finishes. No-ops unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. (`Stop`)
- **Build Verify** — Runs the build before a tool call that could ship broken output. (`PreToolUse`)
- **Image Scan** — Scans container images for known vulnerabilities after a tool call. (`PostToolUse`)

## Triggers reference

`PostFileSave`, `PostFileCreate`, `PostFileDelete`, `PreToolUse`, `PostToolUse`,
`UserPromptSubmit`, `SessionStart`, `Stop`, `PreTaskExec`, `PostTaskExec`.

`matcher` is a single **regex** tested against the event subject — the file path for
file triggers, the tool name for tool triggers. It replaces 0.x's `when.patterns`
glob array. Omit it to match everything.

## Migrating from 0.x

If you have `.kiro.hook` files from an earlier kit, they use the retired 0.x schema
and won't execute in IDE 1.0. Trigger mapping: `fileEdited`→`PostFileSave`,
`fileCreated`→`PostFileCreate`, `fileDeleted`→`PostFileDelete`,
`promptSubmit`→`UserPromptSubmit`, `agentStop`→`Stop`,
`preTaskExecution`→`PreTaskExec`, `postTaskExecution`→`PostTaskExec`. The
`when`/`then` pair becomes `trigger`/`matcher`/`action`, and `userTriggered` is
replaced by manual steering files.

See the [Kiro hooks docs](https://kiro.dev/docs/hooks/) for the full reference.

# Hooks

## Overview

Hooks automate agent actions based on IDE events. When an event occurs, the specified action runs automatically.

Hooks are JSON files in `.kiro/hooks/`. Any `.json` filename works — use descriptive
kebab-case names. Hooks activate when a session starts; no registration step.

This is the **v1 schema** (Kiro IDE 1.0 / CLI 3.0). It replaced the 0.x `.kiro.hook`
format — see [Migrating from 0.x](#migrating-from-0x).

## Hook Schema

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "format-on-save",
      "description": "Run Prettier on saved TypeScript files",
      "enabled": true,
      "trigger": "PostFileSave",
      "matcher": "\\.tsx?$",
      "action": {
        "type": "command",
        "command": "prettier --write {{filePath}}"
      },
      "timeout": 10
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `version` | Yes | Schema version — currently `"v1"` |
| `hooks` | Yes | Array of hook definitions |
| `hooks[].name` | Yes | Identifier for the hook |
| `hooks[].description` | No | Documentation only |
| `hooks[].trigger` | Yes | Event name in PascalCase (see below) |
| `hooks[].matcher` | No | Regex matched against the event subject. Defaults to always-match |
| `hooks[].action.type` | Yes | `"command"` or `"agent"` |
| `hooks[].action.command` | Cond. | Shell command (when `type` is `"command"`) |
| `hooks[].action.prompt` | Cond. | Prompt to inject (when `type` is `"agent"`) |
| `hooks[].timeout` | No | Seconds for command actions (default 60; `0` disables) |
| `hooks[].enabled` | No | Set `false` to skip without deleting (default `true`) |
| `hooks[].confirm` | No | Confirmation prompt before a `Stop` command hook runs |

A single file may define several hooks in the `hooks` array. This kit ships one hook
per file so each stays independently toggleable.

## Triggers

| Trigger | Fires when | Matcher matches | Can block? |
|---|---|---|---|
| `SessionStart` | Session begins | — | No |
| `Stop` | Agent execution completes | — | No |
| `UserPromptSubmit` | You send a message | Prompt text | Yes |
| `PreToolUse` | Before a tool executes | Tool name | Yes |
| `PostToolUse` | After a tool executes | Tool name | No |
| `PostFileCreate` | A new file is created | File path | No |
| `PostFileSave` | A file is saved/modified | File path | No |
| `PostFileDelete` | A file is deleted | File path | No |
| `PreTaskExec` | Before a spec task starts | — | Yes |
| `PostTaskExec` | After a spec task finishes | — | No |

`matcher` is a single **regex**, not a glob array. For tool triggers it matches the
tool name — canonical names (`fs_read`, `fs_write`, `execute_bash`, `use_aws`) or
aliases (`read`, `write`, `shell`, `aws`) both work, as do `@mcp`, `@powers`,
`@builtin` prefixes and `*` for everything.

## Actions

- `command` — runs a subprocess; receives event JSON on stdin. `{{filePath}}` is
  available for file triggers. Costs no credits and is generally faster.
- `agent` — injects a prompt into the agent's context. Starts an agent loop, so it
  **consumes credits**, and it cannot block a trigger.

Prefer `command` for deterministic checks; reach for `agent` only when the task needs
reasoning.

### Exit codes (command actions)

- `0` — success. Stdout is added to context for `SessionStart` and `UserPromptSubmit`.
- `2` — block the event. Only `PreToolUse`, `UserPromptSubmit`, and `PreTaskExec` can
  be blocked; stderr is returned to the model.
- anything else — hook failed; stderr is shown as a warning and execution continues.

## Examples

### Lint on save

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "lint-on-save",
      "trigger": "PostFileSave",
      "matcher": "\\.ts$",
      "action": { "type": "command", "command": "npm run lint" }
    }
  ]
}
```

### Run tests after a spec task

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "test-after-task",
      "trigger": "PostTaskExec",
      "action": { "type": "command", "command": "npm test" }
    }
  ]
}
```

### Review writes

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "review-writes",
      "trigger": "PreToolUse",
      "matcher": "write",
      "action": {
        "type": "agent",
        "prompt": "Verify this follows coding standards"
      }
    }
  ]
}
```

## Manual hooks

0.x's `userTriggered` trigger no longer exists. On-demand automation now ships as a
**manual steering file**: markdown in `.kiro/steering/` with `inclusion: manual`,
which Kiro surfaces as a `/<filename>` slash command (and `#<filename>` in chat).

```markdown
---
inclusion: manual
---

# Cost Estimate

Estimate the monthly cost of the infrastructure defined in this workspace's IaC...
```

## Migrating from 0.x

0.x stored hooks in `.kiro.hook` files using a `when`/`then` pair with camelCase
trigger names. Those files do not execute in IDE 1.0. The IDE shows an upgrade badge
on each legacy hook in the Agent Hooks panel; clicking it converts the hook.

| Old (`when.type`) | New (`trigger`) |
|---|---|
| `agentSpawn` / `sessionStart` | `SessionStart` |
| `agentStop` | `Stop` |
| `promptSubmit` | `UserPromptSubmit` |
| `preToolUse` | `PreToolUse` |
| `postToolUse` | `PostToolUse` |
| `fileCreated` | `PostFileCreate` |
| `fileEdited` | `PostFileSave` |
| `fileDeleted` | `PostFileDelete` |
| `preTaskExecution` | `PreTaskExec` |
| `postTaskExecution` | `PostTaskExec` |
| `userTriggered` | Manual steering file |

Other changes: `then.type: "askAgent"` becomes `action.type: "agent"`,
`then.type: "runCommand"` becomes `action.type: "command"`, and the `when.patterns`
glob array becomes a single `matcher` regex. Kiro also no longer reads a `hooks` key
from `settings.json` — move those registrations into `.kiro/hooks/*.json`.

See the [Kiro hooks docs](https://kiro.dev/docs/hooks/) for the full reference.

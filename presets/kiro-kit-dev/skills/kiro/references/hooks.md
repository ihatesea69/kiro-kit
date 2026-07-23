# Hooks

## Overview

Hooks automate agent actions based on IDE events. When an event occurs, the specified action runs automatically.

## Event Types

- `fileEdited`: When a user saves a code file
- `fileCreated`: When a user creates a new file
- `fileDeleted`: When the user deletes a file
- `userTriggered`: Manual trigger by user
- `promptSubmit`: When a message is sent to the agent
- `agentStop`: When an agent execution completes
- `preToolUse`: Before a tool is executed
- `postToolUse`: After a tool is executed
- `preTaskExecution`: Before a spec task starts
- `postTaskExecution`: After a spec task completes

## Actions

- `askAgent`: Send a prompt to the agent
- `runCommand`: Execute a shell command

## Hook Schema

```json
{
  "name": "Hook Name",
  "version": "1.0.0",
  "description": "Optional description",
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx"]
  },
  "then": {
    "type": "runCommand",
    "command": "npm run lint"
  }
}
```

## File Events

Require `patterns` array with glob patterns:
```json
{
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx"]
  }
}
```

## Tool Events

Require `toolTypes` array with categories or regex:
```json
{
  "when": {
    "type": "preToolUse",
    "toolTypes": ["write"]
  }
}
```

Valid categories: `read`, `write`, `shell`, `web`, `spec`, `*`

## Examples

### Lint on Save
```json
{
  "name": "Lint on Save",
  "version": "1.0.0",
  "when": { "type": "fileEdited", "patterns": ["*.ts"] },
  "then": { "type": "runCommand", "command": "npm run lint" }
}
```

### Run Tests After Task
```json
{
  "name": "Test After Task",
  "version": "1.0.0",
  "when": { "type": "postTaskExecution" },
  "then": { "type": "runCommand", "command": "npm test" }
}
```

### Review Writes
```json
{
  "name": "Review Writes",
  "version": "1.0.0",
  "when": { "type": "preToolUse", "toolTypes": ["write"] },
  "then": { "type": "askAgent", "prompt": "Verify this follows coding standards" }
}
```

#!/usr/bin/env bash
# Statusline: outputs git branch + project name + time on one line.
# Gracefully omits git branch if not a git repository.

BRANCH=""
if git rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi

PROJECT=$(basename "$PWD")
TIME=$(date +"%H:%M")

if [ -n "$BRANCH" ]; then
  echo "$BRANCH | $PROJECT | $TIME"
else
  echo "$PROJECT | $TIME"
fi

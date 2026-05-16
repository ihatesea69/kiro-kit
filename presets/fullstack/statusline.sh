#!/usr/bin/env bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
project=$(basename "$PWD")
time=$(date +%H:%M)
printf "%s | %s | %s" "$branch" "$project" "$time"

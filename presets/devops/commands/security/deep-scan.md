---
description: 🔒🔒🔒 Whole-repository deep security scan (multi-agent pipeline, findings workspace)
inclusion: manual
argument-hint: "[path] [partitions]"
---

## Arguments
TARGET: $1 (default: workspace root; may be a subfolder for a scoped scan)
PARTITIONS: $2 (default: 6 — number of parallel finder partitions)

Run a whole-repository deep security scan of TARGET following the pipeline below.
Activate the `deep-security-scan` skill before starting — it holds the methodology,
severity taxonomy, hard exclusions, and the finding template. This scan is slower and
more thorough than `/review:security` (per-diff gate) and complements — never
replaces — it.

---

## Pipeline

### 1. Preflight

1. Verify TARGET exists and is inside the workspace. Abort with a clear message if not.
2. Estimate repo size: count source files by language (skip `node_modules`, `.git`,
   `dist`, `build`, vendored/generated code). If the estimate exceeds ~2,000 source
   files, WARN the user that a single pass may be shallow and suggest scoping to a
   subfolder — but do not block.
3. Verify `.kiro/security/` is writable; create `.kiro/security/scans/` if missing.
4. Confirm partition count with the user: default PARTITIONS = 6. If the environment
   cannot run subagents in parallel, tell the user and degrade gracefully to running
   the same pipeline sequentially (same artifacts, longer wall-clock).
5. Compute the scan directory: `.kiro/security/scans/<yyyy-mm-dd>-<n>/` where `<n>`
   increments if a scan already exists for today. All later stages write ONLY here.

### 2. Recon

Delegate to the `security-recon` subagent with TARGET and PARTITIONS:

- It maps entry points, trust boundaries, frameworks, and existing sanitization /
  auth patterns, then proposes PARTITIONS non-overlapping partitions of the attack
  surface with a rationale for each.
- It writes `scan-manifest.json` (target, partitions with file globs, frameworks,
  timestamp) into the scan directory.

Do not proceed until `scan-manifest.json` exists and every partition lists concrete
paths.

### 3. Find (parallel fan-out)

Fan out one `security-finder` subagent PER PARTITION, in parallel. Each finder:

- Works ONLY its partition (paths from `scan-manifest.json`).
- Traces data flow from user-controlled inputs to sensitive sinks, localizing each
  candidate at suspicious-point (control-flow) granularity — not just a line, not a
  whole function.
- Writes candidates INCREMENTALLY to `candidates/partition-<k>.json` in the scan
  directory (one JSON array; append after each finding). Never rely on the agent's
  return value alone — if a finder dies, its file still holds partial results.
- Also records files examined vs skipped for `coverage.json`.

After the join, read all `candidates/partition-*.json` files. If a partition file is
missing or empty, note it in coverage as `incomplete` and continue.

### 4. Validate (adversarial, parallel)

Fan out one `security-validator` subagent PER CANDIDATE finding, in parallel (batch
if candidates exceed ~2× PARTITIONS). Each validator is prompted to REFUTE the
finding, assigns confidence 1–10, and returns a verdict.

**Gate: drop every candidate with confidence < 8.** Also drop anything matching the
hard exclusions in the skill (DoS, rate limiting, resource exhaustion, open
redirects, generic input validation without a proven exploit path) — even at
confidence 10.

Write survivors to `validated.json` in the scan directory.

### 5. Judge (serial)

Run a SINGLE `security-judge` subagent pass over `validated.json` — serial, one
finding at a time, so near-simultaneous duplicates are not both classified as new.
It classifies each survivor as `new` / `better-example-of-known` / `duplicate`,
assigns final severity per the skill's taxonomy, and gives each retained finding a
kebab-case slug. Output: `judged.json`.

### 6. Report

Delegate to the `security-reporter` subagent to write the findings workspace from
`judged.json` + `scan-manifest.json` + coverage data:

```
.kiro/security/scans/<yyyy-mm-dd>-<n>/
  report.md              # entry point: exec summary, severity table, links
  findings/<slug>/finding.md
  hardening/<topic>.md   # structural recommendations, not per-bug
  scan-manifest.json
  findings.json          # machine-readable findings array
  coverage.json          # per-partition files examined / skipped / incomplete
```

Then delete the intermediate `candidates/`, `validated.json`, `judged.json` files
and present the user with: severity counts, the top findings (CRITICAL/HIGH first),
and the path to `report.md`.

---

## Rules

- NEVER modify source code during a scan. The scan is read-only except for the scan
  directory.
- NEVER report hard-excluded categories, regardless of confidence.
- Every reported finding must have a concrete attack scenario. "Could be risky" is
  not a finding.
- If zero findings survive validation, still write the full workspace (empty
  `findings/`, honest `report.md`, complete `coverage.json`) — a clean scan is a
  result, not a failure.
- **IMPORTANT:** Sacrifice grammar for concision in intermediate agent reports;
  `report.md` itself must be polished.

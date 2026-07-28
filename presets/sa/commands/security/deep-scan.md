---
description: 🔒🔒🔒 Whole-repository deep security scan (multi-agent pipeline, findings workspace)
inclusion: manual
argument-hint: "[path] [partitions] [--semgrep]"
---

## Arguments
TARGET: $1 (default: workspace root; may be a subfolder for a scoped scan)
PARTITIONS: $2 (default: 6 — number of parallel finder partitions)
FLAGS: `--semgrep` opts into hybrid SAST-first candidate generation (see step 3a)

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
6. Find the PREVIOUS scan: the newest existing directory under
   `.kiro/security/scans/`. If one exists, read its `findings.json` and
   `scan-manifest.json` — this run becomes a **re-scan** and stages 5–6 produce a
   delta (see step 7). Note whether the previous scan's `target` matches TARGET; a
   scoped re-scan only ever compares findings whose file falls inside TARGET.
7. If `--semgrep` was passed, check availability with `semgrep --version`. Record
   `semgrepAvailable` either way; if it is missing, say so once and continue with
   the manual pipeline unchanged. Never install it.

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

### 3a. Semgrep hybrid (optional, only with `--semgrep` + Semgrep available)

Per the skill's `semgrep-hybrid.md` reference: run Semgrep read-only over TARGET
into `semgrep-raw.json`, map each result to its owning partition, then fan out
`security-triage` subagents (one per partition batch, parallel) to classify results
as `true-positive` / `false-positive` / `excluded` with real source context.

True positives are appended to the owning `candidates/partition-<k>.json` with
`source: "semgrep"` and flow through validation exactly like manual candidates —
no shortcut past the gate. Record triage counts in coverage. This augments the
manual finders; it never replaces them.

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

On a re-scan, pass the previous scan's `findings.json` to the judge as well. It
reuses the previous slug whenever a finding shares a root cause with a previous one
(so slugs stay stable across scans), carries over a previous `accepted-risk`
status, and marks each accepted finding `new`, `persisting`, or `regressed` (was
`fixed`, found again).

### 6. Report

Delegate to the `security-reporter` subagent to write the findings workspace from
`judged.json` + `scan-manifest.json` + coverage data:

```
.kiro/security/scans/<yyyy-mm-dd>-<n>/
  report.md              # entry point: exec summary, severity table, links
  findings/<slug>/finding.md
  hardening/<topic>.md   # structural recommendations, not per-bug
  scan-manifest.json
  findings.json          # machine-readable findings array (the CI contract)
  coverage.json          # per-partition files examined / skipped / incomplete
  delta.md               # re-scans only: fixed / new / regressed / persisting
```

Then delete the intermediates (`candidates/`, `validated.json`, `judged.json`,
`semgrep-raw.json`) and present the user with: severity counts, the top findings
(CRITICAL/HIGH first), the delta versus the previous scan if there was one, and the
path to `report.md`.

### 7. Delta (re-scans only)

When step 1 found a previous scan, the reporter also writes `delta.md` and a
`delta` block in `findings.json`:

- **fixed** — in the previous scan, absent now. Carry the finding forward into this
  scan's `findings.json` with `status: fixed` so the audit trail is continuous.
- **new** — no matching root cause in the previous scan.
- **regressed** — previously `fixed`, present again. Call this out first; a
  regression means the fix did not hold.
- **persisting** — open in both. Include the age in days since first seen.

On a scoped re-scan (`TARGET` is a subfolder), only findings whose file falls
inside TARGET may be marked `fixed` — a finding outside the scanned scope was not
examined and must be carried over unchanged. Say so explicitly in `delta.md`;
silently "fixing" unscanned findings is the one way this feature can lie.

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

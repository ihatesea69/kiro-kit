# Hand-off: `deep-security-scan` — clone Codex Security Deep Scan for Kiro-Kit

Research-grounded plan so a fresh session can build this feature without prior context.
Sources were adversarially verified (3-vote refutation per claim); confidence noted inline.

## 1. Objective

A **whole-repository deep security scan** for Kiro workspaces, cloning the shape of
OpenAI's Codex Security "Deep Scan" (`$codex-security:deep-security-scan`): a
multi-agent pipeline (recon → parallel finders → adversarial validators → serial
judge/dedup → reporter) that writes a **findings workspace**
(`report.md` + `findings/<slug>/` + `hardening/` + 3 JSON automation files).

Complements — does not replace — the existing per-diff `review/security` command and
the infra-focused `security-auditor` agent.

## 2. What the research confirmed (build on these)

### Codex Security Deep Scan (primary source: learn.chatgpt.com/docs/security/plugin/deep-scans)
- **Invocation** `$codex-security:deep-security-scan`, scopeable to a folder via absolute
  path. *(confirmed 3-0)*
- **Hard preflight gate**: delegated workers + **≥6 usable worker slots**, else the user
  must fall back to a standard scan. *(confirmed 3-0)*
- **Output = 6 artifacts**: `report.md` (entry point), `findings/<slug>/` (one detailed
  report per finding, incl. PoC files), `hardening/` (structural proposals),
  `scan-manifest.json`, `findings.json`, `coverage.json` (for automation/CI).
  *(confirmed 3-0)*
- Deep scans are positioned as slower/more thorough than standard scans and complement
  (not replace) diff reviews.
- **NOT reliably documented** (claims refuted): its internal pipeline stages, agent
  isolation model, exact finder taxonomy. Do not claim parity with internals — clone the
  *contract* (invocation, preflight, output), design the pipeline from the analogs below.

### anthropics/claude-code-security-review — closest open-source analog *(confirmed 3-0)*
- **Three-phase methodology**: (1) repository context research — frameworks, existing
  sanitization patterns, threat model; (2) comparative analysis vs existing secure
  patterns; (3) vulnerability assessment — trace data flow from user inputs to sensitive
  operations.
- **Validation pipeline**: one finder sub-task → **N parallel validator sub-tasks (one
  per finding)** → drop anything with confidence **< 8/10**.
- **Hard exclusions** (FP strategy): DoS, rate limiting, memory/CPU exhaustion, generic
  input validation without proven impact, open redirects.
- Ships as a plain markdown slash command — the exact structural template for a Kiro
  command file.

### anthropics/defending-code-reference-harness *(patterns confirmed 3-0; full 7-stage architecture claim refuted — borrow only these two)*
- **Recon partitioning**: a lightweight agent reads the source tree and proposes a
  partition of the attack surface so parallel finders start in *different* subsystems
  instead of converging on the same bug.
- **Serial judge dedup**: a judge agent compares verified findings against
  already-reported ones (new / better example of known / duplicate), running **serially**
  so near-simultaneous duplicates aren't both classified as new.

### Kiro IDE capabilities *(confirmed 3-0)*
- Subagents run **in parallel with a join barrier** (main agent blocks until all
  complete). Custom agents = markdown files in `<workspace>/.kiro/agents/` — exactly
  Kiro-Kit's preset `agents/` layout.
- **Unknown**: an API to count available subagent slots; max fan-out; failure semantics
  of the join barrier (see Risks).

### Academic patterns *(confirmed 3-0, medium confidence)*
- **QASecClaw**: SAST-first hybrid — run Semgrep to generate candidates, LLM classifies
  TP/FP per candidate with source context (88.6% FP reduction on OWASP Benchmark).
  → optional Phase 4 enhancement.
- **FuzzingBrain "Suspicious Point"**: localize findings at control-flow granularity —
  between line-level (too little context) and function-level (attention bias). → use in
  the finder prompt.

## 3. Design

### Placement
Ship as a **shared feature added to existing presets** (like the spec library), starting
with `devops`, `backend`, `sa`, `fullstack`. Do NOT create a new preset (a preset must
carry ≥16 agents/≥22 skills/≥40 commands; a scan feature doesn't justify that).

### File layout (per preset)
```
commands/security/deep-scan.md          # orchestrator command ($deep-scan [path])
agents/security-recon.md                # partitions the attack surface
agents/security-finder.md               # per-partition vulnerability hunter
agents/security-validator.md            # adversarial FP filter, confidence 1-10
agents/security-judge.md                # serial dedup: new / better-example / duplicate
agents/security-reporter.md             # writes the findings workspace
skills/deep-security-scan/SKILL.md      # methodology + templates
skills/deep-security-scan/references/
  severity-taxonomy.md                  # CRITICAL..INFORMATIONAL + hard exclusions
  finding-template.md                   # findings/<slug>/finding.md format
  vuln-classes.md                       # finder scope checklist (injection, authz, ...)
steering/security-scanning.md           # when to deep-scan vs /review:security; workspace contract
hooks/deep-scan-stale.kiro.hook         # optional: nudge when scan > 30 days old (disabled)
```

### Pipeline (encoded in `commands/security/deep-scan.md`)
1. **Preflight** — target path exists; repo size estimate (file count by language);
   `.kiro/security/` writable; warn (don't block) if the workspace looks too large for
   one pass; ask user for partition count N (default 6, honoring the Codex "6 workers"
   shape).
2. **Recon** — `security-recon` subagent maps entry points, trust boundaries, frameworks,
   existing sanitization patterns (= claude-code-security-review Phase 1) and proposes N
   partitions with rationale. Written to `scan-manifest.json`.
3. **Find** — fan out N parallel `security-finder` subagents, one per partition. Each
   traces data flow from inputs to sensitive sinks, reports candidate findings with
   file/line/category/severity/attack-scenario at suspicious-point granularity.
4. **Validate** — fan out one `security-validator` subagent per candidate finding,
   prompted to REFUTE it (adversarial), assign confidence 1–10; drop < 8.
5. **Judge** — single `security-judge` pass (serial) over survivors: dedup
   (new / better-example / duplicate), final severity, slug assignment.
6. **Report** — `security-reporter` writes the findings workspace:
```
.kiro/security/scans/<yyyy-mm-dd>-<n>/
  report.md            # exec summary, severity table, links to findings
  findings/<slug>/finding.md
  hardening/<topic>.md # structural recommendations (survivor-adjacent, not per-bug)
  scan-manifest.json   # target, partitions, agent counts, timing
  findings.json        # machine-readable findings array
  coverage.json        # per-partition files examined / skipped
```

### Severity taxonomy
CRITICAL (RCE, auth bypass, secret exposure) · HIGH (SQLi/command/XXE, privilege
escalation) · MEDIUM (SSRF, IDOR, insecure deserialization, weak crypto) · LOW (info
disclosure, missing headers) · INFO (best-practice gaps).
**Hard-excluded** (never report): DoS, rate limiting, resource exhaustion, open
redirects, generic input validation without a proven exploit path.

### Finding template (`findings/<slug>/finding.md`)
YAML frontmatter: `id, slug, severity, category, file, line, confidence, status`.
Body: Summary · Affected Code · Attack Scenario · Proof of Concept · Remediation ·
References.

## 4. Build phases (seed for requirements.md / design.md / tasks.md)

- **Phase 1 — MVP**: command + finder + reporter only (single finder, no fan-out);
  skill + steering + taxonomy/template references; workspace output complete.
  Exit: scan of a sample repo produces valid report.md + findings/ + findings.json.
- **Phase 2 — Fan-out + verification**: recon partitioning, N parallel finders,
  per-finding adversarial validators with the ≥8/10 gate, serial judge dedup.
  Exit: on a seeded-vulnerable sample, FP rate visibly drops vs Phase 1; no duplicate
  findings across partitions.
- **Phase 3 — Hardening + automation files**: hardening/ recommendations,
  scan-manifest.json + coverage.json, `deep-scan-stale` native hook (disabled by
  default), README/docs.
- **Phase 4 — CI + hybrid**: GitHub Actions workflow consuming findings.json (fail on
  CRITICAL/HIGH), optional Semgrep-first candidate generation (QASecClaw pattern),
  scoped re-scan (`$deep-scan path/`) diffing against the previous scan.

Wire per preset: manifest declarations via `scripts/sync-preset-manifests.mjs` (run
after adding files); no CLI code changes needed (feature is pure preset content).

## 5. Risks / open questions (resolve during Phase 1)

1. **No Kiro API to count subagent slots** — the Codex "≥6 slots" preflight can't be
   probed; replace with a user-confirmed partition count + graceful degradation to
   sequential execution.
2. **Join-barrier failure semantics unknown** — if one finder dies, does the barrier
   return partial results? Mitigate: each finder writes its partition results to a file
   incrementally; reporter works from files, not agent return values.
3. **Scope split vs existing security assets** — `review/security` stays the fast
   per-diff gate; `security-auditor` stays infra/compliance; deep-scan owns whole-repo
   code vulnerabilities. Steering file must state this to avoid double-reporting.
4. **Codex internals are opaque** — we clone the contract, not the implementation;
   don't market as "same engine".
5. Time-sensitivity: Codex Security is a research preview (Mar 2026); Kiro subagent
   docs are v0.9 (Feb 2026) — re-verify before Phase 2.

## 6. Estimated size

Per preset: 1 command + 5 agents + 1 skill (4 files) + 1 steering + 1 hook ≈ 12 files;
×4 presets + docs ≈ ~50 files. One focused session for Phases 1–2, a second for 3–4.

---
inclusion: always
description: When to use each security asset (deep scan vs per-diff review vs infra audit) and the findings-workspace contract.
---

# Security Scanning

This workspace has two security assets with **non-overlapping** scopes. Pick by
scope, not by convenience, and never report the same issue through both.

| Asset | Scope | Speed | Use when |
|---|---|---|---|
| `/review:security` | Changed lines / current diff | Fast | Pre-commit, pre-merge gate |
| `/security:deep-scan` | Whole repository, application code | Slow (multi-agent) | Periodic audit, pre-release, new codebase, post-incident |

Rules of thumb:
- A vulnerability in application source code → deep scan.
- A regression introduced by the current change → `/review:security`.
- A pure infrastructure/compliance audit (IAM, container CVEs, CIS/SOC2) is out of
  scope for both; that lives in the `devops` preset's `security-auditor` agent.

## Deep scan pipeline

`recon` → N parallel `security-finder` → 1 `security-validator` per candidate
(adversarial, confidence 1–10, **drop < 8**) → serial `security-judge` (dedup by
root cause) → `security-reporter`.

The confidence gate and the hard exclusions (DoS, rate limiting, resource
exhaustion, open redirects, generic input validation without a proven exploit path)
exist to keep false positives near zero. Do not relax them to "be thorough."

## Findings workspace contract

Every scan writes exactly this, and nothing outside it:

```
.kiro/security/scans/<yyyy-mm-dd>-<n>/
  report.md              # human entry point
  findings/<slug>/finding.md   (+ optional poc files)
  hardening/<topic>.md
  scan-manifest.json     # target, partitions, frameworks, entry points, agent counts
  findings.json          # machine-readable — CI consumes this
  coverage.json          # per-partition examined / skipped / status
```

- Scans are **append-only history**: never overwrite or delete a previous scan
  directory. Same-day repeats increment `<n>`.
- Scans never modify source code. Remediation is a separate, explicit task.
- `findings.json` is the CI contract. A pipeline may fail the build on any
  `severity: CRITICAL` or `HIGH` with `status: open`.
- Fixed a finding? Set its `status` to `fixed` in the finding's frontmatter and in
  `findings.json`, in place. Don't delete the finding — the history is the audit trail.
- Numbers in `report.md`, `findings.json`, and `coverage.json` must always agree.

## Scoping

`/security:deep-scan <path>` scopes to a subfolder. Prefer scoped scans on large
repos (>~2,000 source files) — a full pass there is shallower per-file than several
scoped passes.

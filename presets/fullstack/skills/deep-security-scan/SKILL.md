---
name: deep-security-scan
description: Methodology, severity taxonomy, and templates for a whole-repository deep security scan. Activate when running /security:deep-scan or when orchestrating the recon → find → validate → judge → report pipeline.
---

# Deep Security Scan

Activate this skill when running a whole-repository deep security scan (the
`/security:deep-scan` command). It holds the methodology the five security agents
share, the severity taxonomy, the hard exclusions that keep the false-positive
rate low, and the finding/report templates.

## When to Use

- A user asks for a thorough, whole-repo security assessment (not a per-diff review).
- You are orchestrating or acting as one of the `security-recon`, `security-finder`,
  `security-validator`, `security-judge`, or `security-reporter` agents.

## When NOT to Use (scope boundary)

- **Per-diff / pre-merge review** → use `/review:security`. That is the fast gate on
  changed lines; this scan is the slow, whole-repo sweep.
- **Infrastructure / compliance audit** (IAM, container CVEs, CIS/SOC2) → out of
  scope; that is the `devops` preset's `security-auditor` agent. This scan owns
  application *code* vulnerabilities.
- Avoid double-reporting: if a finding is purely an infra misconfiguration, note it
  and defer rather than filing it as a code vulnerability.

## Methodology (three phases, per finder)

Adapted from published open-source security-review practice:

1. **Repository context** — learn the frameworks, the existing sanitization/auth
   patterns, and the threat model BEFORE looking for bugs. (Recon produces this;
   finders consume it.)
2. **Comparative analysis** — judge suspect code against the codebase's OWN secure
   patterns. Deviation from the house pattern is the strongest lead; absence of any
   pattern is judged against the framework's secure default.
3. **Vulnerability assessment** — trace data flow from user-controlled inputs to
   sensitive sinks. A finding is a complete, reachable path with insufficient
   defense. Localize at suspicious-point (control-flow) granularity.

## Pipeline shape

```
recon (1, serial)  →  finders (N, parallel)  →  validators (1 per candidate, parallel)
   → judge (1, serial dedup)  →  reporter (1, serial)
```

- **Parallel finders** each own a disjoint partition so they don't converge on the
  same obvious bug.
- **Adversarial validators** try to REFUTE each candidate and score confidence 1–10;
  everything **< 8 is dropped**.
- **Serial judge** dedups by ROOT CAUSE (new / better-example / duplicate) — serial so
  simultaneous duplicates aren't both accepted.
- Finders write results to files incrementally, so a dead subagent doesn't lose its
  partition's work.

## Confidence gate

Drop any finding a validator scores below **8/10**. Genuine uncertainty lowers the
score — never round up. A false positive erodes trust in every future scan; a missed
true positive costs one bug.

## References

- `references/severity-taxonomy.md` — CRITICAL…INFO definitions **and the hard
  exclusions** (never report these).
- `references/finding-template.md` — the exact `findings/<slug>/finding.md` format.
- `references/vuln-classes.md` — the finder's per-partition scope checklist.

## Output contract

Writes a findings workspace to `.kiro/security/scans/<yyyy-mm-dd>-<n>/`:
`report.md` (entry point) · `findings/<slug>/finding.md` · `hardening/<topic>.md` ·
`scan-manifest.json` · `findings.json` · `coverage.json`. See the
`security-scanning` steering file for the workspace contract and CI consumption.

## Rules

- Never modify source code during a scan — read-only except for the scan directory.
- Never report a hard-excluded category, regardless of confidence.
- Every finding needs a concrete attack scenario; "could be risky" is not a finding.
- A clean scan still writes the full workspace — a zero-finding result is honest, not
  a failure.

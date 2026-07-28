# CI Integration

The scan is agent-driven and runs inside Kiro — CI cannot produce a scan. What CI
*can* do is enforce the result: gate on the committed `findings.json` and shout
when the newest scan goes stale.

## The contract

`findings.json` in each scan directory is the machine-readable interface:

```json
{ "scanId": "2026-07-28-1", "target": ".", "generatedAt": "<ISO 8601>",
  "summary": { "critical": 0, "high": 1, "medium": 2, "low": 0, "info": 0 },
  "findings": [ { "slug": "sqli-order-search", "severity": "HIGH",
    "category": "injection", "file": "src/orders.ts", "line": 42,
    "confidence": 9, "status": "open" } ] }
```

`status` is the field CI keys on: `open` blocks, `fixed` and `accepted-risk` do
not. Fixing a finding means editing `status` in BOTH `findings.json` and the
finding's frontmatter — never deleting the finding, so the scan history stays an
audit trail.

## The gate script

`scripts/check-findings.mjs` (zero dependencies, Node ≥ 18) picks the newest scan
under `.kiro/security/scans/` and exits non-zero when an open finding sits at or
above the threshold.

```bash
node .kiro/skills/deep-security-scan/scripts/check-findings.mjs --fail-on HIGH
```

| Flag | Effect |
|---|---|
| `--fail-on <SEVERITY>` | Threshold; default `HIGH` (so CRITICAL + HIGH block) |
| `--root <path>` | Workspace root holding `.kiro/security/scans` (default cwd) |
| `--scan-dir <path>` | Check a specific scan instead of the newest |
| `--max-age-days <n>` | Also fail when the newest scan is older than n days |
| `--format github` | Emit `::error file=…,line=…` annotations |

Exit codes: `0` pass · `1` gate failed · `2` no scan found / malformed input.
The `2` case is deliberately distinct — "we never scanned" is a different problem
from "we scanned and found something", and a pipeline may choose to warn rather
than block on it.

## GitHub Actions

Copy `assets/deep-scan-gate.yml` to `.github/workflows/deep-scan-gate.yml`. It
blocks on open CRITICAL/HIGH for every PR and push, enforces a 30-day freshness
limit only on the weekly schedule (so a stale scan never blocks unrelated work),
and uploads the scan directory as an artifact.

## Other CI systems

The script is plain Node with no runner-specific behavior beyond `--format
github`, so any system can call it:

```bash
# GitLab CI / Jenkins / CircleCI
node .kiro/skills/deep-security-scan/scripts/check-findings.mjs --fail-on HIGH || exit 1
```

## Pre-release gate

Before a release, run the stricter combination — no open findings at all, and a
scan from the current cycle:

```bash
node .kiro/skills/deep-security-scan/scripts/check-findings.mjs --fail-on LOW --max-age-days 14
```

## Rules

- CI consumes scans; it never authors or edits them.
- Never lower `--fail-on` to make a red build green. Either fix the finding, or
  mark it `accepted-risk` with a written justification in the finding file — that
  decision belongs in the audit trail, not in a CI flag.

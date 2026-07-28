# Semgrep Hybrid Mode (optional)

An optional SAST-first path for the find stage: let Semgrep generate candidates
cheaply and deterministically, then have an LLM classify each one true/false
positive with real source context. The pattern comes from QASecClaw, which
reported a large false-positive reduction on the OWASP Benchmark by pairing a
scanner's recall with a model's context sensitivity.

Hybrid mode **augments** the manual finders; it never replaces them. Semgrep only
finds what its rules encode — business-logic authorization flaws, tenant
confusion, and multi-hop data flows stay invisible to it.

## When to use it

- Large repos where full manual partition coverage would be shallow.
- Languages with strong Semgrep rule coverage (Python, JavaScript/TypeScript, Go,
  Java, Ruby, PHP, C#).
- Regression sweeps where deterministic, repeatable candidate generation matters.

Skip it when Semgrep is not installed, the language has thin rule coverage, or the
target is small enough for the manual finders to read end to end.

## Availability check

Hybrid mode is opt-in and must degrade silently:

```bash
semgrep --version
```

If the command is missing or errors, note `"semgrepAvailable": false` in
`scan-manifest.json`, tell the user once, and run the manual pipeline unchanged.
Never install Semgrep as a side effect of a scan.

## Candidate generation

```bash
semgrep --config=p/security-audit --config=p/secrets \
        --json --quiet --no-git-ignore=false \
        --output <scanDir>/semgrep-raw.json <target>
```

Add language packs as the recon manifest's `frameworks` indicate (e.g.
`p/javascript`, `p/python`, `p/golang`, `p/django`, `p/express`). Keep the run
read-only; never pass `--autofix`.

Then map each Semgrep result onto the partition that owns its file, so triage work
distributes exactly like the manual finders do.

## Triage

Fan out `security-triage` subagents over the Semgrep results — one per partition's
batch, in parallel. Each reads the flagged code with surrounding context and
classifies every result:

- **`true-positive`** → becomes a candidate with `source: "semgrep"`, carrying the
  Semgrep `check_id` as a reference. It then goes through the SAME adversarial
  validator and the SAME ≥8/10 gate as a manual candidate — no shortcut.
- **`false-positive`** → dropped with a one-line reason (sanitizer present, test
  fixture, unreachable, rule mismatch).
- **`excluded`** → matched a hard-excluded category (DoS, rate limiting, resource
  exhaustion, open redirect, generic input validation).

Record triage counts in `coverage.json` under `semgrep`:

```json
{ "semgrep": { "ran": true, "rulesets": ["p/security-audit"], "rawResults": 0,
  "truePositive": 0, "falsePositive": 0, "excluded": 0 } }
```

Being transparent about the drop rate matters — if Semgrep produced 200 results and
triage kept 3, the user should see that, not a silent 3.

## Dedup with manual findings

Semgrep-sourced and manually-found candidates frequently collide. The serial
`security-judge` handles this normally — same root cause means one finding — but
prefer the manual finding's write-up as the retained example when both exist, and
record the Semgrep `check_id` on it as a cross-reference. Manual write-ups carry
the traced data flow; Semgrep's carry a rule id.

## Rules

- Semgrep output is a *candidate list*, never a finding list. Nothing skips
  validation.
- Never report a raw Semgrep result verbatim — every reported finding needs a
  concrete attack scenario written from the code.
- Never fail the scan because Semgrep is absent.
- Delete `semgrep-raw.json` when the reporter finishes; the retained findings and
  the coverage counts are the durable record.

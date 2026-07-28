# Finding Template

Each accepted finding is written to `findings/<slug>/finding.md` using this exact
structure. Any proof-of-concept script goes in a sibling file in the same folder and
is linked from the Proof of Concept section.

```markdown
---
id: <p-k-n or judge-assigned id>
slug: <kebab-case, category-first, unique — e.g. sqli-order-search>
severity: CRITICAL | HIGH | MEDIUM | LOW | INFO
category: injection | authz | authn | crypto | secrets | deserialization | ssrf | path-traversal | xss | other
file: <primary file path>
line: <primary line>
confidence: <8-10>
status: open | fixed | accepted-risk
source: manual | semgrep
---

# <Human-readable title>

## Summary
One or two sentences: what the flaw is and its impact, in plain language.

## Affected Code
`<file>:<line>-<endLine>`

​```<language>
<the minimal excerpt showing the flaw at suspicious-point granularity>
​```

## Attack Scenario
Concrete, step-by-step: who the attacker is (privilege level), the exact input they
control, and the concrete impact. No hand-waving — a reviewer should be able to
follow it end to end.

## Proof of Concept
A request, payload, or script that demonstrates the flaw. Link any script file in
this folder (e.g. `./poc.py`). If a runnable PoC would be irresponsible to include,
describe the exact steps instead and say why.

## Data Flow
Source → … → sink, as a short chain of `file:line` hops.

## Remediation
The specific fix, referencing the codebase's OWN secure pattern where one exists
(e.g. "use the `db.query(sql, params)` helper as in `users.ts:44`"). Include a
corrected code snippet when it clarifies.

## Also Affects
Other locations sharing this root cause (from the judge's `alsoAffects`), each as
`file:line`. Omit the section if there are none.

## References
CWE id(s), OWASP category, and any framework-specific advisory. Links only — no
copied third-party text.
```

## Rules

- The frontmatter `slug` must match the folder name and the `findings.json` entry.
- `confidence` is the validator's score (≥8; the gate already dropped the rest).
- `status` starts at `open`. It becomes `fixed` when remediated, or
  `accepted-risk` with a written justification in the body — never delete a
  finding, the history is the audit trail. CI blocks on `open` only.
- `source` records how the candidate was generated: `manual` (a finder's own
  data-flow tracing) or `semgrep` (a SAST candidate that survived triage).
- Keep the excerpt minimal — enough to see the flaw, not the whole file.
- Remediation must be actionable and specific to THIS codebase, not generic advice.

# Severity Taxonomy & Hard Exclusions

Every finding gets exactly one severity. Judge by *reachable impact under a realistic
attacker*, not theoretical worst case.

## Severities

### CRITICAL
Full compromise reachable by a remote or low-privilege attacker.
- Remote code execution / command injection reaching a shell
- Authentication bypass (log in as any user / no auth where auth is required)
- Exposed secrets granting production access (live API keys, private keys, DB creds
  in source or reachable endpoints)
- SQL injection returning or mutating arbitrary data

### HIGH
Serious compromise, or CRITICAL-class flaws gated by a modest precondition.
- SQL / NoSQL / command / XXE injection with meaningful but bounded impact
- Privilege escalation (user → admin)
- Insecure direct object reference exposing other users' sensitive data at scale
- Server-side request forgery reaching internal services / cloud metadata

### MEDIUM
Real vulnerability needing chaining or a narrower precondition.
- SSRF with limited reach, IDOR on lower-sensitivity data
- Insecure deserialization without a proven gadget chain
- Weak / misused cryptography (ECB, static IV, MD5/SHA1 for passwords, hardcoded salt)
- Stored XSS in an authenticated-only surface

### LOW
Limited impact or requires significant preconditions.
- Reflected XSS requiring unusual user interaction
- Information disclosure (stack traces, verbose errors, internal paths)
- Missing security headers with a demonstrable (not theoretical) consequence
- CSRF on a state-changing but low-value action

### INFO
Best-practice gap with no direct exploit path. Report sparingly; prefer folding into
`hardening/`.

## Hard Exclusions — NEVER report these (any confidence)

These inflate false-positive rates without protecting users. If a candidate is only
one of these, drop it — do not record it, do not lower it to INFO.

- **Denial of service** — crashes, unbounded loops, algorithmic complexity
- **Rate limiting** — absence of throttling
- **Resource exhaustion** — memory/CPU/disk pressure, zip bombs, large-payload OOM
- **Open redirects** — redirect-to-arbitrary-URL without a further proven exploit
- **Generic input validation** — "this input isn't validated" without a concrete
  sink and exploit path
- **Best-practice nagging** without impact — "should use const", missing comments,
  style. Not security.
- **Theoretical crypto** with no reachable attacker (e.g. non-security-relevant use
  of a weak hash for a cache key)

An exception exists only when one of the above is the *mechanism* of a real,
in-scope finding (e.g. a DoS that is the trigger for an auth bypass) — then report
the in-scope finding, not the excluded category.

## Severity adjustment

- Reachable by an unauthenticated attacker → keep or raise.
- Requires admin/local/physical access → lower one or more levels; often out of scope.
- The same root cause repeated across many sites → the judge may bump one level for
  the systemic finding (recorded with `alsoAffects`).

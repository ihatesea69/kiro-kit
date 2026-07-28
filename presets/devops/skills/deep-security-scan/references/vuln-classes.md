# Vulnerability Class Checklist (finder scope)

The finder works this checklist against its partition, keeping to the classes that
match the partition's technology. Each class lists the sinks to trace inputs toward.
Respect the hard exclusions in `severity-taxonomy.md`.

## Injection
- **SQL / NoSQL** — string-built queries, ORM `.raw()` / `$where`, interpolated
  filters. Sink: DB driver. Look for the parameterized helper the codebase uses
  elsewhere.
- **Command / OS** — `exec`, `spawn`, `system`, `child_process`, backticks, shell
  templating. Sink: shell. Any user data in argv or a shell string.
- **Code / template** — `eval`, `Function()`, server-side template injection
  (Jinja/EJS/Handlebars with user data in the template, not the context), prototype
  pollution reaching a gadget.
- **XXE** — XML parsers with external entities enabled.
- **LDAP / header / log injection** — user data in LDAP filters, HTTP response
  headers, or log lines that reach a parser.

## Authentication & Session
- Missing auth on a sensitive route; auth check that can be skipped (early return,
  misordered middleware).
- Weak session tokens (predictable, no rotation on privilege change), JWT with
  `alg:none` / unverified signature / secret confusion.
- Password handling: plaintext, fast hashes (MD5/SHA1), missing per-user salt,
  timing-unsafe comparison.

## Authorization
- IDOR — object id from the request used to fetch/mutate without an ownership check.
- Missing function-level authz — admin action reachable by a normal user.
- Path/tenant confusion — one tenant reaching another's data.

## Secrets & Sensitive Data
- Hardcoded API keys, private keys, DB credentials, tokens in source or config.
- Secrets logged, returned in responses/errors, or committed in fixtures.
- Sensitive data sent to third parties or stored unencrypted.

## Crypto
- ECB mode, static/predictable IV or nonce, hardcoded keys, weak algorithms (DES,
  RC4), `Math.random()` for security tokens, missing signature verification.

## Deserialization & Injection into Parsers
- `pickle`, `yaml.load` (unsafe), Java/PHP native deserialization, `JSON.parse`
  feeding a dangerous reviver, untrusted data into a native-object parser.

## SSRF & Request Forgery
- User-controlled URL in a server-side HTTP client; check for allowlists and for
  reachability of internal services / cloud metadata (169.254.169.254).
- CSRF on state-changing endpoints lacking token/SameSite protection.

## Path & File Handling
- Path traversal — user filename/path in file reads/writes without normalization +
  base-dir containment check.
- Unrestricted upload — user-controlled filename/extension/content-type reaching a
  web-served or executable location.
- Zip/tar extraction writing outside the target dir (zip-slip).

## Web (XSS & client trust)
- Stored/reflected/DOM XSS — user data into HTML without contextual encoding,
  `dangerouslySetInnerHTML`, `innerHTML`, unescaped template output.
- Trusting client-supplied security-relevant fields (price, role, isAdmin).

## Framework / Config
- Debug mode in production, permissive CORS (`*` with credentials), disabled TLS
  verification, insecure cookie flags on session cookies (missing HttpOnly/Secure
  where it matters).

## Method reminder
For each class in scope: find the SINK, walk backward to a user-controlled SOURCE,
and confirm no adequate defense sits between them. No complete source→sink path =
no finding.

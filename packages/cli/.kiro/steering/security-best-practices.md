---
inclusion: always
description: Security best practices for backend development covering authentication, input validation, data protection, and common vulnerability prevention.
---

# Security Best Practices

## Input Validation

- Validate all input on the server side regardless of client validation
- Use allowlists over denylists for input validation
- Parameterize all database queries (never concatenate user input into SQL)
- Validate content types and reject unexpected formats
- Set maximum request body size limits
- Sanitize file uploads (validate type, size, scan for malware)

## Authentication

- Hash passwords with bcrypt (cost factor 12+) or argon2id
- Implement account lockout after repeated failed attempts
- Use constant-time comparison for token/password verification
- Invalidate sessions on password change
- Implement proper logout (invalidate tokens server-side)
- Use secure session configuration (httpOnly, secure, sameSite)

## Authorization

- Implement role-based access control (RBAC) at minimum
- Check authorization on every request (not just UI hiding)
- Use principle of least privilege for service accounts
- Validate resource ownership before allowing access
- Log authorization failures for monitoring

## Data Protection

- Encrypt sensitive data at rest (AES-256)
- Use TLS 1.2+ for all data in transit
- Never log sensitive data (passwords, tokens, PII)
- Mask sensitive fields in API responses
- Implement data retention policies
- Use environment variables for secrets (never hardcode)

## Common Vulnerabilities (OWASP Top 10)

- SQL Injection: use parameterized queries exclusively
- XSS: encode output, use Content-Security-Policy headers
- CSRF: use anti-CSRF tokens for state-changing operations
- SSRF: validate and restrict outbound URLs
- Mass Assignment: use explicit allowlists for request body fields
- Broken Access Control: verify permissions on every endpoint

## HTTP Security Headers

Set these headers on all responses:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'`
- `X-XSS-Protection: 0` (rely on CSP instead)
- `Referrer-Policy: strict-origin-when-cross-origin`

## Rate Limiting

- Implement rate limiting on all public endpoints
- Use sliding window or token bucket algorithms
- Return 429 with Retry-After header when limit exceeded
- Apply stricter limits to authentication endpoints
- Consider per-user and per-IP limits separately

## Logging and Monitoring

- Log all authentication events (success and failure)
- Log authorization failures
- Never log sensitive data in plain text
- Implement alerting for suspicious patterns
- Retain logs for compliance requirements
- Use structured logging (JSON format) for analysis

## Dependency Security

- Audit dependencies regularly (npm audit, pip-audit, govulncheck)
- Pin dependency versions in production
- Use lockfiles (package-lock.json, poetry.lock, go.sum)
- Monitor for CVEs in dependencies
- Remove unused dependencies promptly

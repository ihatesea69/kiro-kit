---
description: Perform a security-focused review of the codebase
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: all, options: auth, api, database, dependencies)

## Workflow
1. Run dependency audit (npm audit / pip-audit)
2. Check for OWASP Top 10 vulnerabilities
3. Review authentication and authorization logic
4. Verify input validation and output encoding
5. Check for secrets in code or config files
6. Assess security headers and transport configuration
7. Produce security report with severity ratings

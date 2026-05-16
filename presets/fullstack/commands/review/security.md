---
description: Run a security review on the codebase
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: recent changes)

## Workflow
1. Check for hardcoded secrets and credentials
2. Review authentication and authorization logic
3. Check for injection vulnerabilities (SQL, XSS, CSRF)
4. Verify input validation on all endpoints
5. Check dependency vulnerabilities (`npm audit`)
6. Report findings with severity and remediation steps

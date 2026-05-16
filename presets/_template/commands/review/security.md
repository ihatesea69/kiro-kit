---
description: Review code for security vulnerabilities
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: src)

## Workflow
1. Scan for common vulnerability patterns (injection, XSS, auth issues)
2. Check dependency versions for known CVEs
3. Verify secrets are not hardcoded
4. Report findings with severity and remediation steps

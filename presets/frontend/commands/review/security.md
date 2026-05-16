---
description: Perform a security review of the codebase
inclusion: manual
---

## Workflow
1. Scan for hardcoded secrets and credentials
2. Check dependency vulnerabilities with `npm audit`
3. Review authentication and authorization patterns
4. Check for XSS, CSRF, and injection vulnerabilities
5. Verify Content Security Policy headers
6. Report findings with severity and remediation steps

---
description: Security review focused on data handling and credentials
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: full project)

## Workflow
1. Scan for hardcoded credentials and API keys
2. Check `.env` files are gitignored
3. Verify data access controls and permissions
4. Check for SQL injection in database queries
5. Review dependency vulnerabilities (`pip audit`)
6. Check model serving endpoints for auth
7. Report findings with remediation steps


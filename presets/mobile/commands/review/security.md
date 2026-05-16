---
description: Review code for security vulnerabilities and mobile-specific risks
inclusion: manual
argument-hint: "[path]"
---

## Arguments
PATH: $1 (default: ".", entire project)

## Workflow
1. Scan for hardcoded secrets, API keys, credentials
2. Check secure storage usage for sensitive data
3. Verify network security (certificate pinning, HTTPS)
4. Check permission usage and data privacy compliance
5. Review authentication and session management
6. Report vulnerabilities with severity and remediation

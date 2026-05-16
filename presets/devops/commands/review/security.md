---
description: Run security review on infrastructure and application code
inclusion: manual
argument-hint: "[scope]"
---

## Arguments
SCOPE: $1 (default: full project)

## Workflow
1. Scan for hardcoded secrets and credentials
2. Check IAM policies for over-permissive access
3. Review network security configurations
4. Validate encryption settings
5. Check dependency vulnerabilities
6. Produce security report with severity ratings

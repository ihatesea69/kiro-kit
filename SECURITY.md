# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in kiro-kit, please report it
responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **GitHub Security Advisory** (preferred): Use the "Report a vulnerability"
   button on the Security tab of this repository.
2. **Email**: Send details to the maintainer email listed in `package.json`.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response SLA

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Critical fix | Within 7 days |
| Non-critical fix | Within 30 days |

### Disclosure Policy

- We follow coordinated disclosure. Please allow us reasonable time to address
  the issue before any public disclosure.
- Credit will be given to reporters in the changelog and release notes unless
  anonymity is requested.
- We will notify you when the fix is released so you can verify.

## Supported Versions

Only the latest published version receives security updates. We recommend
always using the most recent release.

## Scope

The following are in scope for security reports:

- Path traversal in file write operations
- Arbitrary code execution via preset content
- Credential or secret leakage through telemetry
- Dependency vulnerabilities with exploitable impact

The following are out of scope:

- Denial of service via large preset files (local tool)
- Issues requiring physical access to the machine

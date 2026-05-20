# Security Testing Guide

## OWASP Top 10 Coverage

1. Broken Access Control
2. Cryptographic Failures
3. Injection (SQL, XSS, Command)
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable Components
7. Authentication Failures
8. Data Integrity Failures
9. Logging Failures
10. Server-Side Request Forgery

## Authentication Testing

- Test login with invalid credentials
- Verify account lockout after failed attempts
- Check session management (timeout, invalidation)
- Test password requirements enforcement
- Verify MFA flows

## Input Validation

- Test XSS vectors in all input fields
- Check SQL injection on parameterized queries
- Validate file upload restrictions
- Test path traversal attempts
- Verify content type validation

## Security Headers

- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
- X-XSS-Protection (deprecated but check absence)

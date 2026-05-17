---
name: better-auth
description: >-
  Implement authentication and authorization with modern patterns including
  OAuth 2.1, JWT, sessions, RBAC, and multi-factor authentication. Use when
  building auth systems.
license: MIT
version: 2.0.0
---

# Better Auth

Activate this skill when implementing authentication or authorization systems.

## When to Use

- Adding authentication to an application
- Implementing OAuth flows (Google, GitHub, Discord)
- Setting up JWT or session-based auth
- Implementing role-based access control (RBAC)
- Adding multi-factor authentication (TOTP, SMS)
- Managing user sessions and token refresh
- Implementing passkeys/WebAuthn

## Authentication Patterns

### JWT (Stateless)
- Short-lived access tokens (15-60 minutes)
- Long-lived refresh tokens (7-30 days, stored securely)
- Rotate refresh tokens on use (detect token theft)
- Include minimal claims (user ID, roles)
- Validate signature, expiry, and issuer on every request

### Session-Based (Stateful)
- Store sessions server-side (Redis for distributed)
- Use httpOnly, secure, sameSite cookies
- Implement session rotation on privilege escalation
- Set absolute and idle timeouts
- Invalidate all sessions on password change

### OAuth 2.1
- Use PKCE for all flows (including server-side)
- Validate state parameter to prevent CSRF
- Store tokens encrypted at rest
- Implement token refresh before expiry
- Handle provider-specific scopes and claims

## Authorization Patterns

- RBAC: roles with permission sets
- ABAC: attribute-based policies for complex rules
- Resource-based: check ownership before access
- Always check authorization server-side (never trust client)

## Security Rules

- Hash passwords with bcrypt (cost 12+) or argon2id
- Use constant-time comparison for tokens
- Implement account lockout after failed attempts
- Log all auth events for audit trail
- Never store plain-text passwords or tokens
- Validate redirect URIs strictly (no open redirects)

---
name: container-security
description: Secure container images and runtime environments. Use when building Dockerfiles, scanning images, or hardening container deployments.
---

# Container Security

Activate this skill when securing container images and runtime environments.

## When to Use

- Building secure Dockerfiles
- Scanning images for vulnerabilities
- Configuring container runtime security
- Implementing image signing and verification
- Setting up admission controllers
- Hardening Kubernetes pod security

## Best Practices

- Use minimal base images (distroless, alpine, scratch)
- Run containers as non-root user
- Drop all capabilities, add only what is needed
- Use read-only root filesystem where possible
- Scan images in CI pipeline before pushing to registry
- Sign images with cosign or Notary
- Set resource limits to prevent DoS
- Use seccomp and AppArmor profiles

## Scanning Tools

- Trivy: comprehensive vulnerability scanner
- Grype: container image vulnerability scanner
- Hadolint: Dockerfile linter
- Dockle: container image security linter

## Rules

- Never use `latest` tag in production
- Never run as root unless absolutely required
- Never store secrets in image layers
- Always scan before deploying to production
- Pin all package versions in Dockerfiles
- Remove build tools from final image stage

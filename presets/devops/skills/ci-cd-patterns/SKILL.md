---
name: ci-cd-patterns
description: Design and implement CI/CD pipeline patterns for reliable, fast, and secure software delivery. Use when building or optimizing build and deployment pipelines.
---

# CI/CD Patterns

Activate this skill when designing or optimizing CI/CD pipelines.

## When to Use

- Designing new CI/CD pipelines
- Optimizing build times and caching
- Implementing deployment strategies
- Adding security scanning to pipelines
- Setting up multi-environment promotion
- Configuring GitOps workflows

## Pipeline Stages

1. Validate: lint, format check, schema validation
2. Build: compile, bundle, create artifacts
3. Test: unit, integration, contract tests
4. Scan: SAST, dependency audit, container scan
5. Package: build container image, push to registry
6. Deploy: apply to target environment
7. Verify: smoke tests, health checks, canary analysis

## Deployment Strategies

- Rolling: gradual replacement, zero-downtime
- Blue-Green: instant switch between environments
- Canary: route percentage of traffic to new version
- Feature Flags: deploy dark, enable incrementally

## Rules

- Fail fast: cheapest checks run first
- Cache aggressively: dependencies, layers, build artifacts
- Pin versions: actions, base images, dependencies
- Use OIDC: no long-lived credentials in CI
- Separate build from deploy for auditability
- Every deployment must be reversible
- Quality gates must block on failure
- Pipeline changes require code review

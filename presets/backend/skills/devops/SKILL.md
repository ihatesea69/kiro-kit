---
name: devops
description: >-
  Deploy and manage infrastructure with Docker, Kubernetes, CI/CD pipelines, and
  cloud services. Use when containerizing, deploying, or managing production
  infrastructure.
license: MIT
version: 1.0.0
---

# DevOps

Activate this skill when working with containers, deployments, CI/CD, or cloud infrastructure.

## When to Use

- Writing or optimizing Dockerfiles
- Configuring docker-compose for local development
- Setting up CI/CD pipelines (GitHub Actions, GitLab CI)
- Managing cloud infrastructure (AWS, GCP, Cloudflare)
- Implementing deployment strategies
- Configuring monitoring and alerting
- Writing infrastructure-as-code (Terraform, Pulumi)

## Docker Best Practices

- Use multi-stage builds to minimize image size
- Run as non-root user in production
- Pin base image versions (not :latest)
- Use .dockerignore to exclude unnecessary files
- Add HEALTHCHECK instructions
- Set resource limits (memory, CPU)
- Order layers for optimal caching (dependencies before source)

## CI/CD Pipeline Stages

1. Lint and typecheck
2. Unit tests
3. Build artifacts
4. Integration tests
5. Security scan (dependencies + container)
6. Deploy to staging
7. Smoke tests
8. Deploy to production (with approval gate)

## Deployment Strategies

- Blue-green: instant rollback, double resources
- Canary: gradual rollout, early detection
- Rolling: zero-downtime, incremental replacement
- Feature flags: decouple deploy from release

## Monitoring

- Application metrics: request rate, error rate, latency (RED)
- Infrastructure metrics: CPU, memory, disk, network
- Business metrics: signups, conversions, revenue
- Alerting: page on symptoms, not causes

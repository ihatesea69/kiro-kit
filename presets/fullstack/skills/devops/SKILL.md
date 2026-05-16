---
name: devops
description: Deploy and manage infrastructure with Docker, CI/CD pipelines, and cloud services. Use when containerizing, deploying, or managing production infrastructure.
---

# DevOps

Activate when working with containers, deployments, CI/CD, or cloud infrastructure.

## When to Use

- Writing or optimizing Dockerfiles
- Configuring docker-compose for local development
- Setting up CI/CD pipelines (GitHub Actions, GitLab CI)
- Managing cloud infrastructure (Vercel, AWS, GCP)
- Implementing deployment strategies

## Docker Best Practices

- Use multi-stage builds to minimize image size
- Run as non-root user in production
- Pin base image versions (not :latest)
- Use .dockerignore to exclude unnecessary files
- Order layers for optimal caching

## CI/CD Pipeline Stages

1. Lint and typecheck
2. Unit tests
3. Build artifacts
4. Integration tests
5. Security scan
6. Deploy to staging
7. Smoke tests
8. Deploy to production

## Deployment Strategies

- Blue-green: instant rollback, double resources
- Canary: gradual rollout, early detection
- Rolling: zero-downtime, incremental replacement
- Feature flags: decouple deploy from release

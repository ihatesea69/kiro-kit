# Code Standards

## Terraform

- Use `terraform fmt` for consistent formatting
- Pin provider versions in `versions.tf`
- Use modules for reusable infrastructure components
- Variables must have descriptions and type constraints
- Use validation blocks for input validation
- Outputs must have descriptions
- Use `locals` for computed values, not repeated expressions
- Never hardcode account IDs, regions, or environment names

## Docker

- Use multi-stage builds for production images
- Pin base image versions (no `latest` tag)
- Run as non-root user
- Use `.dockerignore` to minimize build context
- Order layers from least to most frequently changing
- Combine RUN commands to reduce layers
- Set HEALTHCHECK instruction

## Kubernetes

- Use namespaces for isolation
- Set resource requests AND limits
- Implement liveness, readiness, and startup probes
- Use ConfigMaps for non-sensitive config
- Use external secret managers for sensitive data
- Apply network policies
- Use pod disruption budgets for critical workloads

## CI/CD Pipelines

- Pin action/image versions to SHA
- Use OIDC for cloud authentication
- Cache dependencies and build artifacts
- Fail fast: cheapest checks run first
- Separate build and deploy stages
- Include rollback mechanism

## File Organization

```
infrastructure/
  modules/             Reusable Terraform modules
  environments/        Environment-specific configs
kubernetes/
  base/                Kustomize base manifests
  overlays/            Environment overlays
docker/
  Dockerfile           Application Dockerfile
  docker-compose.yml   Local development
.github/workflows/     CI/CD pipeline definitions
scripts/               Operational scripts
docs/                  Documentation
```

## Naming

- Terraform resources: snake_case (`web_server`)
- Kubernetes resources: kebab-case (`my-service`)
- Docker images: kebab-case (`my-app`)
- Environment variables: UPPER_SNAKE_CASE (`DATABASE_URL`)
- Files: kebab-case (`deploy-script.sh`)

## Git Conventions

- Conventional commits: `type(scope): description`
- Branch naming: `feature/description`, `fix/description`, `infra/description`
- PR titles under 72 characters
- Squash merge to main

## Security

- No secrets in code or environment files committed to git
- Use secret managers (AWS Secrets Manager, Vault, etc.)
- Least-privilege IAM policies
- Encrypt data at rest and in transit
- Scan dependencies and images for vulnerabilities
- Review security groups and network policies regularly

---
inclusion: always
description: Infrastructure as Code patterns and conventions for Terraform, Kubernetes, and cloud resource management.
---

# Infrastructure Patterns

## Terraform Conventions

- One module per logical resource group (networking, compute, database)
- Use `variables.tf`, `outputs.tf`, `main.tf`, `versions.tf` per module
- Pin provider versions in `versions.tf`
- Use `terraform fmt` and `terraform validate` before commits
- Store state remotely with locking enabled
- Use workspaces or directory structure for environment separation
- Tag all resources: environment, team, cost-center, managed-by

## Kubernetes Manifests

- Use namespaces for environment and team isolation
- Set resource requests AND limits on all containers
- Implement all three probe types: liveness, readiness, startup
- Use ConfigMaps for non-sensitive configuration
- Use external secret managers for sensitive data
- Apply network policies to restrict pod-to-pod communication
- Use pod disruption budgets for critical workloads

## File Organization

```
infrastructure/
  modules/             Reusable Terraform modules
    networking/
    compute/
    database/
  environments/        Environment-specific configurations
    dev/
    staging/
    production/
  kubernetes/          K8s manifests
    base/              Kustomize base
    overlays/          Environment overlays
  scripts/             Operational scripts
```

## Naming Conventions

- Resources: `<project>-<environment>-<resource-type>`
- Terraform variables: snake_case (`instance_type`)
- Kubernetes resources: kebab-case (`my-service`)
- Helm values: camelCase (`replicaCount`)

## Environment Promotion

- dev: auto-deploy on merge to main
- staging: manual trigger or scheduled
- production: manual approval required, canary first
- All environments use same IaC with different variable values

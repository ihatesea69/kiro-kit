---
name: devops
description: Deploy and manage cloud infrastructure with Docker, Kubernetes, Terraform, and CI/CD pipelines. Use when working with containers, orchestration, IaC, or cloud platforms.
---

# DevOps

Activate this skill when working with infrastructure, containers, deployments, or cloud services.

## When to Use

- Building or modifying Dockerfiles and docker-compose configurations
- Writing Terraform/OpenTofu modules and configurations
- Configuring Kubernetes manifests, Helm charts, or Kustomize
- Designing CI/CD pipelines (GitHub Actions, GitLab CI)
- Managing cloud resources (AWS, GCP, Azure)
- Implementing deployment strategies (blue-green, canary, rolling)

## Core Practices

- Infrastructure as Code: all infrastructure defined in version-controlled files
- Immutable infrastructure: replace, never patch in place
- GitOps: git as single source of truth for desired state
- Least privilege: minimal permissions for all service accounts
- Defense in depth: multiple security layers
- Observability: metrics, logs, and traces for all services

## Docker Guidelines

- Use multi-stage builds to minimize image size
- Pin base image versions (no `latest` tag)
- Run as non-root user
- Use `.dockerignore` to exclude unnecessary files
- Order layers from least to most frequently changing
- Scan images for vulnerabilities before pushing

## Terraform Guidelines

- Use modules for reusable components
- Pin provider and module versions
- Store state remotely with locking
- Use `terraform plan` before every apply
- Tag all resources for cost tracking
- Never store secrets in state files

## Kubernetes Guidelines

- Set resource requests and limits on all containers
- Use namespaces for environment isolation
- Implement health checks (liveness, readiness, startup probes)
- Use network policies to restrict pod communication
- Store secrets in external secret managers (not in manifests)
- Use pod disruption budgets for availability

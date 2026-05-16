---
inclusion: always
description: Docker and container conventions for building secure, efficient container images and compose configurations.
---

# Docker Conventions

## Dockerfile Standards

- Use multi-stage builds to separate build and runtime
- Pin base image versions with SHA digest for reproducibility
- Run as non-root user (create dedicated user in Dockerfile)
- Order layers from least to most frequently changing
- Combine RUN commands to reduce layer count
- Use `.dockerignore` to exclude unnecessary files

## Image Selection

- Production: use distroless or alpine-based images
- Build stage: use full SDK images for compilation
- Never use `latest` tag in production Dockerfiles
- Prefer official images from Docker Hub or verified publishers

## Security

- Do not store secrets in image layers (use build secrets or runtime injection)
- Drop all capabilities, add only what is needed
- Use read-only root filesystem where possible
- Scan images with trivy or grype before pushing to registry
- Set `HEALTHCHECK` instruction for orchestrator integration

## Docker Compose

- Use named volumes for persistent data
- Define resource limits (memory, CPU) for all services
- Use environment files (`.env`) for configuration
- Define explicit networks for service isolation
- Use `depends_on` with health check conditions

## Naming

- Images: `<registry>/<org>/<service>:<version>`
- Containers: `<project>-<service>-<instance>`
- Volumes: `<project>-<service>-data`
- Networks: `<project>-<tier>` (frontend, backend, data)

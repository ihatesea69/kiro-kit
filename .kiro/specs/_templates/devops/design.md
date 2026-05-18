# Design: [Feature Name]

## Architecture

### Infrastructure Diagram

```
[Load Balancer]
  |
  +-- [Service A] -- [Database]
  |
  +-- [Service B] -- [Cache]
```

### Component Overview

Describe each infrastructure component and its role:
- Compute: type, sizing, scaling strategy
- Storage: type, retention, backup policy
- Networking: VPC, subnets, security groups
- Monitoring: metrics, alerts, dashboards

## Infrastructure as Code

### Module Structure

```
infrastructure/
  modules/
    [module-name]/
      main.tf
      variables.tf
      outputs.tf
  environments/
    dev/
    staging/
    production/
```

### Key Decisions

- State backend: [S3/GCS/Azure Blob]
- Secret management: [AWS Secrets Manager/Vault/etc]
- Container orchestration: [EKS/GKE/AKS/ECS]
- CI/CD platform: [GitHub Actions/GitLab CI/etc]

## Deployment Strategy

- [ ] Rolling update
- [ ] Blue-green deployment
- [ ] Canary release
- [ ] Feature flags

### Rollback Plan

Describe how to revert if deployment fails.

## Monitoring and Observability

### SLIs and SLOs

| Indicator | Target | Measurement |
|-----------|--------|-------------|
| Availability | 99.9% | Uptime checks |
| Latency (p99) | < 500ms | APM metrics |
| Error rate | < 0.1% | Log analysis |

### Alerting

- P1 (page): [conditions]
- P2 (notify): [conditions]
- P3 (ticket): [conditions]

## Security Considerations

- Network isolation approach
- Encryption strategy
- Access control model
- Compliance requirements

## Cost Estimate

| Resource | Monthly Cost | Notes |
|----------|-------------|-------|
| Compute | $X | [sizing rationale] |
| Storage | $X | [retention policy] |
| Network | $X | [traffic estimate] |

# System Architecture

## Overview

Document the high-level system architecture, infrastructure components, and their interactions.

## Infrastructure Diagram

```
[Internet]
    |
[CDN / WAF]
    |
[Load Balancer]
    |
+---+---+
|       |
[App]  [App]  (Auto-scaling group)
|       |
+---+---+
    |
[Database]  [Cache]  [Queue]
```

## Components

### Compute

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Application | [ECS/EKS/EC2] | [description] |
| Workers | [Lambda/ECS] | [description] |
| Scheduler | [EventBridge/CronJob] | [description] |

### Storage

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Primary DB | [RDS/Cloud SQL] | [description] |
| Cache | [ElastiCache/Memorystore] | [description] |
| Object Store | [S3/GCS] | [description] |

### Networking

| Component | CIDR/Config | Purpose |
|-----------|-------------|---------|
| VPC | 10.0.0.0/16 | [description] |
| Public Subnets | 10.0.1.0/24 | Load balancers |
| Private Subnets | 10.0.10.0/24 | Application |
| Data Subnets | 10.0.20.0/24 | Databases |

## Environments

| Environment | Purpose | Scale | Region |
|-------------|---------|-------|--------|
| Development | Feature development | Minimal | [region] |
| Staging | Pre-production testing | Production-like | [region] |
| Production | Live traffic | Auto-scaled | [region] |

## Deployment Pipeline

```
Code Push -> Lint/Test -> Build Image -> Scan -> Deploy Dev -> Deploy Staging -> Deploy Prod
```

## Monitoring

- Metrics: [Prometheus/CloudWatch/Datadog]
- Logging: [ELK/CloudWatch Logs/Loki]
- Tracing: [OpenTelemetry/X-Ray/Jaeger]
- Alerting: [PagerDuty/OpsGenie/Slack]

## Disaster Recovery

- RTO: [target]
- RPO: [target]
- Backup strategy: [description]
- Failover procedure: [description]

## Security

- Authentication: [method]
- Authorization: [method]
- Encryption: [at rest and in transit details]
- Network security: [VPC, security groups, NACLs]

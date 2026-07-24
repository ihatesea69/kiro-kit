# Requirements: [Feature Name]

## Overview

Brief description of the infrastructure feature and its purpose.

## User Stories

- As a [platform engineer/SRE/developer], I want to [action] so that [benefit]

## Functional Requirements

### Infrastructure
- [ ] Resources provisioned correctly in target environment
- [ ] Configuration parameterized for multi-environment support
- [ ] State managed remotely with proper locking
- [ ] Tagging applied for cost tracking and ownership

### Reliability
- [ ] Health checks configured for all services
- [ ] Auto-scaling rules defined for variable load
- [ ] Backup and recovery procedures documented
- [ ] Failover tested and documented

### Security
- [ ] Least-privilege IAM policies applied
- [ ] Encryption at rest and in transit enabled
- [ ] Network segmentation implemented
- [ ] Secrets managed via external secret store

## Non-Functional Requirements

- [ ] Deployment completes in under 10 minutes
- [ ] Recovery Time Objective (RTO): [specify]
- [ ] Recovery Point Objective (RPO): [specify]
- [ ] 99.9% availability SLO for production

## Acceptance Criteria

1. [Specific, testable criterion]
2. [Specific, testable criterion]
3. [Specific, testable criterion]

---
inclusion: always
description: The 6 AWS Well-Architected pillars and how to apply them when designing and reviewing architectures.
---

# AWS Well-Architected Framework

Every architecture this workspace produces gets evaluated against the six
pillars. A design is not "done" until its design.md (or SAD) contains a pillar
review table: pillar → findings → severity → remediation.

## The Six Pillars

### 1. Operational Excellence
- Everything as code: infrastructure, runbooks, dashboards, alarms.
- Small, reversible changes; every deployment has a rollback path.
- Design telemetry in from the start (structured logs, metrics, traces).
- Runbooks for every alarm; game days to rehearse failure.

### 2. Security
- Least privilege everywhere: IAM policies scoped to resource + action, no `*` in production policies.
- Defense in depth: VPC boundaries, security groups, NACLs, WAF — not just one layer.
- Encrypt at rest (KMS) and in transit (TLS ≥1.2); classify data before choosing controls.
- No long-lived credentials: roles, OIDC federation, Secrets Manager with rotation.
- Enable audit trails (CloudTrail, Config) before workloads, not after incidents.

### 3. Reliability
- State RTO/RPO targets per workload — a design without numbers is not reviewable.
- Multi-AZ as baseline for production; multi-region only when RTO/RPO demands it.
- Design for failure: health checks, timeouts, retries with backoff + jitter, circuit breakers, DLQs.
- Test recovery paths (backup restore, failover) on a schedule; untested DR is fiction.
- Throttle and load-shed at boundaries; know every quota you depend on.

### 4. Performance Efficiency
- Pick managed/serverless first; own servers only for demonstrated need.
- Right-size from measurements, not guesses; revisit after real traffic.
- Cache deliberately (CloudFront, ElastiCache, DAX) with explicit invalidation strategy.
- Measure with percentiles (p95/p99), never averages.

### 5. Cost Optimization
- Every design.md carries a cost model: main cost drivers + monthly estimate band.
- Tag everything for allocation; budgets + alerts before launch.
- Match pricing model to usage: Savings Plans/RIs for steady state, Spot for interruptible, serverless for spiky.
- Lifecycle policies on all object storage; delete what retention doesn't require.

### 6. Sustainability
- Prefer regions with greener energy where latency/compliance allows.
- Maximize utilization: scale-to-zero, right-sizing, Graviton where compatible.
- Reduce data movement and stored redundancy; compress and tier aggressively.

## How to Apply in This Workspace

1. **During design** (design.md): add a "Well-Architected Review" section — a
   table with one row per pillar, honest findings, and severity (info/low/med/high).
2. **During review** (`/iac:well-architected-review` command): walk the pillars
   against the concrete IaC, not the intentions.
3. **Trade-offs are explicit.** When pillars conflict (cost vs reliability),
   record the decision as an ADR (see `architecture-decision-records` steering).
4. Findings of severity high block the spec's approval gate.

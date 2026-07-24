# Requirements Document

## Introduction

This document defines the requirements for an **AWS Multi-Region Disaster Recovery (DR) Architecture** that protects a production workload using an active/passive warm-standby topology across two AWS regions. The primary region hosts all live traffic; the DR region runs scaled-down but fully provisioned replicas of every stateful component, enabling rapid promotion without cold-start provisioning delays.

The design targets an **RTO of 15 minutes** and an **RPO of 5 minutes** for a regional failure event. Failover is initiated by Route 53 health-check-driven DNS cutover and follows a runbook that operators execute step-by-step; failback to the primary region is a separate, explicitly approved runbook step. Periodic game-day drills verify that the RTO/RPO targets are achievable by real teams under realistic conditions.

Deliverables are **architecture artifacts**, not application code: a draw.io diagram (generated via the `drawio-ai` CLI), Terraform modules that wire the DR infrastructure, a failover/failback runbook document, Architecture Decision Records (ADRs) comparing DR strategies, and a Well-Architected review with emphasis on the Reliability pillar.

## Glossary

| Term | Definition |
|------|-----------|
| RTO | Recovery Time Objective — the maximum acceptable time from the moment a disaster is declared to the moment the workload is serving production traffic again; target is **15 minutes** for this architecture. |
| RPO | Recovery Point Objective — the maximum acceptable age of data that may be lost during a regional failure; target is **5 minutes** for this architecture. |
| Warm standby | A DR pattern in which the DR region runs a scaled-down but fully operational copy of the production environment; promotion requires scaling up and routing traffic, not provisioning from scratch. |
| Pilot light | A DR pattern in which only the minimum core components (e.g., a stopped database replica) are running in the DR region; full provisioning is required before traffic can be served. |
| Active/active | A DR pattern in which both regions simultaneously serve production traffic; no failover step is required, but consistency and routing complexity increase significantly. |
| Failover | The operational process of redirecting production traffic from the primary region to the DR region after a regional failure is declared. |
| Failback | The operational process of redirecting production traffic back to the primary region after it has been restored and validated post-incident. |
| Health check | An AWS Route 53 resource (`aws_route53_health_check`) that probes an endpoint and marks the associated DNS record as unhealthy when the probe fails, triggering DNS failover. |
| Game day | A scheduled, production-like drill in which the team executes the failover runbook against a sandbox environment and measures actual RTO and RPO against targets. |
| Replication lag | The time delta between a write committed in the primary region and its arrival (and commit) in the DR region replica; must remain below the RPO budget for each replication path. |
| Split-brain | A failure mode in which both the primary and DR regions believe they are active and accept writes simultaneously, causing data divergence and potential data loss. |
| Cross-region read replica | An RDS read replica located in a different AWS region from the primary instance; promotion converts it to a standalone writable primary. |

## Out of Scope

- Application-level code changes; this spec covers only infrastructure wiring and operational artifacts.
- Database schema migrations during failover; the assumption is schema parity between primary and DR at all times.
- Multi-account AWS Organizations governance; both regions are assumed to reside in the same AWS account.
- Failover of services not listed in this spec (e.g., SQS queues, ElastiCache clusters, Kinesis streams); those are explicitly deferred to a follow-on workstream.
- Active/active or active/passive with automatic failover without human approval; all failover decisions require an on-call engineer to confirm via the runbook.
- Cost optimisation of the DR region beyond right-sizing the warm-standby capacity; billing analysis is a separate workstream.

## Requirements

### Requirement 1: Route 53 Health Checks and Failover DNS Routing

**User Story:** As an on-call engineer, I want Route 53 to automatically mark the primary region endpoint as unhealthy and begin returning DR region DNS records within 90 seconds of a regional failure, so that DNS clients stop routing traffic to the failed region before the human failover runbook is even started.

#### Acceptance Criteria

1. WHEN a Terraform apply is executed against the `modules/route53-failover` module, THE SYSTEM SHALL create one `aws_route53_health_check` resource for the primary region endpoint with `type = "HTTPS"`, `request_interval = 10` seconds, `failure_threshold = 3` consecutive failures, and `measure_latency = true`; and a corresponding health check for the DR region endpoint with identical probe parameters.
2. WHEN the primary-region health check resource is created, THE SYSTEM SHALL create a PRIMARY failover DNS record (`aws_route53_record` with `failover_routing_policy { type = "PRIMARY" }`) associated with the primary health check ID, and a SECONDARY failover DNS record for the DR region endpoint — both pointing to the same hosted zone and record name.
3. WHEN the primary health check has reported 3 consecutive failures (≤ 30 seconds after actual failure onset given a 10-second probe interval), THE SYSTEM SHALL resolve the application FQDN to the DR region endpoint for all new DNS queries, measured using `dig` from an external resolver with TTL set to `60` seconds on both failover records.
4. WHEN the primary region health check transitions from UNHEALTHY back to HEALTHY for 3 consecutive successful probes, THE SYSTEM SHALL NOT automatically restore the PRIMARY record as the active DNS response; restoration requires an explicit human-approved step in the failback runbook to prevent flapping.
5. WHERE CloudWatch alarms are configured for the health check, THE SYSTEM SHALL publish a `HealthCheckStatusChange` notification to an SNS topic (`aws_sns_topic.dr_alerts`) within 60 seconds of any health-check state transition, delivering the event to the on-call PagerDuty integration endpoint.

---

### Requirement 2: RDS Cross-Region Read Replica Promotion

**User Story:** As a database administrator, I want an RDS cross-region read replica in the DR region that can be promoted to a standalone writable primary within the RTO budget, so that the application's relational database is available in the DR region within 10 minutes of declaring a failover.

#### Acceptance Criteria

1. WHEN the Terraform `modules/rds-dr` module is applied, THE SYSTEM SHALL create an `aws_db_instance` resource with `replicate_source_db` set to the ARN of the primary region RDS instance, `multi_az = true` in the DR region, `storage_encrypted = true`, and `auto_minor_version_upgrade = false`; the replica identifier SHALL follow the naming convention `{primary_identifier}-dr-replica`.
2. WHEN the replication lag CloudWatch metric `ReplicaLag` on the DR read replica exceeds 60 seconds, THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to the `dr_alerts` SNS topic with severity `WARNING`; if lag exceeds 240 seconds, a second alarm SHALL publish with severity `CRITICAL`.
3. WHEN a failover is declared and the operator executes the promotion step of the runbook, THE SYSTEM SHALL use the AWS CLI command `aws rds promote-read-replica --db-instance-identifier {replica_id}` and complete promotion (replica transitions to `available` status) within 8 minutes of command invocation, leaving at most 5 minutes of in-flight transactions not yet replicated (satisfying the RPO budget).
4. WHEN the read replica is promoted, THE SYSTEM SHALL update the application's database connection string (stored in AWS Secrets Manager `dr/db/connection-string`) to point to the promoted instance's endpoint, and the secret rotation SHALL be triggered automatically by a Lambda function invoked by the runbook's promotion EventBridge rule.
5. WHERE automated backups are enabled on the primary RDS instance, THE SYSTEM SHALL configure `backup_retention_period = 7` days and `backup_window = "02:00-03:00"` on the DR replica so that point-in-time recovery is available independently of the primary after promotion.

---

### Requirement 3: S3 Cross-Region Replication

**User Story:** As a storage engineer, I want all objects written to the primary region S3 buckets to be automatically replicated to DR region buckets within 15 minutes of upload, so that the DR region has a recent copy of all object data before any failover is needed.

#### Acceptance Criteria

1. WHEN the `modules/s3-replication` Terraform module is applied, THE SYSTEM SHALL configure an `aws_s3_bucket_replication_configuration` on each source bucket with `role = aws_iam_role.s3_replication_role.arn`, at least one replication rule with `status = "Enabled"`, and a `destination` block specifying the DR bucket ARN and `storage_class = "STANDARD_IA"`.
2. WHEN S3 Replication Time Control (RTC) is enabled on the replication configuration, THE SYSTEM SHALL guarantee that 99.99 % of newly uploaded objects are replicated to the DR bucket within 15 minutes, as measured by the CloudWatch metric `ReplicationLatency` for the S3 RTC SLA.
3. WHEN an object is deleted in the primary bucket with a versioning delete marker, THE SYSTEM SHALL replicate the delete marker to the DR bucket only if `delete_marker_replication { status = "Enabled" }` is explicitly configured; accidental deletion propagation SHALL be prevented in buckets tagged `dr_delete_protection = "true"` by setting `delete_marker_replication { status = "Disabled" }`.
4. WHEN the replication IAM role is created, THE SYSTEM SHALL scope its trust policy to `s3.amazonaws.com` and its permission policy to only the actions `s3:GetReplicationConfiguration`, `s3:ListBucket`, `s3:GetObjectVersionForReplication`, `s3:GetObjectVersionAcl`, `s3:ReplicateObject`, `s3:ReplicateDelete`, and `s3:ReplicateTags` on the specific source and destination bucket ARNs — no wildcard resources.
5. WHERE AWS S3 Batch Replication is required to seed the DR buckets on initial setup or after an extended replication gap, THE SYSTEM SHALL provide a runbook step that creates an S3 Batch Operations job targeting all existing objects in the source bucket and monitors the job's completion report before proceeding.

---

### Requirement 4: DynamoDB Global Tables

**User Story:** As a backend engineer, I want DynamoDB tables used by the application to be configured as global tables with replicas in both the primary and DR regions, so that DynamoDB data is available in the DR region with near-zero RPO without requiring a separate replication mechanism.

#### Acceptance Criteria

1. WHEN the `modules/dynamodb-global` Terraform module is applied, THE SYSTEM SHALL create an `aws_dynamodb_table` resource with `billing_mode = "PAY_PER_CAPACITY"` (or `"PROVISIONED"` where capacity is known), at least one `replica` block targeting the DR region, `stream_enabled = true`, and `stream_view_type = "NEW_AND_OLD_IMAGES"` — which is required by DynamoDB global tables.
2. WHEN a write is committed to the DynamoDB table in the primary region, THE SYSTEM SHALL replicate the item to the DR region replica within 1 second under normal conditions, as measured by the DynamoDB CloudWatch metric `ReplicationLatency` on the replica; an alarm SHALL fire if the 99th-percentile replication latency exceeds 5 seconds.
3. WHEN the application is operating in DR mode (primary region is unavailable), THE SYSTEM SHALL accept writes to the DR region replica table directly without any promotion or reconfiguration step, because global tables support multi-master writes by design.
4. WHEN a conflict arises from simultaneous writes to the same item in both regions (split-brain window during failover), THE SYSTEM SHALL resolve it using the DynamoDB last-writer-wins strategy, and the conflict SHALL be logged to CloudWatch Logs under the log group `/aws/dynamodb/conflict-resolution/{table_name}` via a DynamoDB Streams Lambda consumer.
5. WHERE a DynamoDB table is not required to be globally available (e.g., session caches tagged `global_table = "false"`), THE SYSTEM SHALL NOT create a global table replica for it, and the table SHALL be documented in the architecture diagram as region-local with explicit RPO = data loss acceptable.

---

### Requirement 5: Failover and Failback Runbook

**User Story:** As an on-call site-reliability engineer, I want a step-by-step runbook that guides me through declaring a disaster, executing a controlled failover to the DR region, and subsequently failing back to the primary region, so that a solo on-call engineer with no prior DR practice can complete the entire failover sequence within the 15-minute RTO.

#### Acceptance Criteria

1. WHEN a regional failure is suspected, THE SYSTEM SHALL provide a triage checklist in the runbook that directs the engineer to verify the AWS Service Health Dashboard, confirm primary region health-check status in Route 53, confirm replication lag metrics in CloudWatch, and collect a `disaster_declaration_timestamp` before proceeding — all within 3 minutes.
2. WHEN failover is declared, THE SYSTEM SHALL provide ordered runbook steps that: (a) confirm Route 53 has already cut over DNS (or manually update the SECONDARY record to PRIMARY if health checks have not triggered), (b) promote the RDS cross-region replica using the AWS CLI, (c) update Secrets Manager `dr/db/connection-string`, (d) scale up the DR region Auto Scaling group to production capacity, and (e) validate application health via the `/health/ready` endpoint — with a target completion time of 12 minutes for steps (a)–(e).
3. WHEN failback to the primary region is initiated, THE SYSTEM SHALL require the engineer to: (a) verify that the primary region is stable and the database has been restored from backup or a fresh replica, (b) set up reverse replication from DR to primary (data synchronisation), (c) validate data consistency using a checksum comparison script `scripts/validate-db-consistency.sh`, and (d) shift DNS back to the primary region in Route 53 — all steps gated by an explicit confirmation prompt in the runbook.
4. WHEN any runbook step fails or exceeds its time budget, THE SYSTEM SHALL direct the engineer to a documented escalation path: paging the DR team Slack channel `#dr-on-call`, creating a PagerDuty incident of severity P1, and preserving all terminal outputs and CloudWatch log excerpts as attachments to the incident.
5. WHERE the runbook references AWS CLI commands, THE SYSTEM SHALL include the exact command with all required flags and region parameters, and each command SHALL be preceded by a pre-condition check (e.g., `aws rds describe-db-instances --db-instance-identifier {id} --query 'DBInstances[0].DBInstanceStatus'`) so the engineer can confirm the resource is in the expected state before proceeding.

---

### Requirement 6: Periodic Game-Day Testing

**User Story:** As an engineering manager, I want the DR architecture to be exercised via a scheduled game-day drill in a sandbox environment at least once per quarter, so that the team can confirm that the RTO and RPO targets are achievable and identify gaps in the runbook before a real disaster occurs.

#### Acceptance Criteria

1. WHEN a game-day drill is scheduled, THE SYSTEM SHALL provide a `game-day-playbook.md` that defines: scope (which components to fail), success criteria (measured RTO ≤ 15 min, measured RPO ≤ 5 min), a pre-drill checklist (sandbox environment matches production topology, monitoring dashboards are open, participants are assigned roles), and a post-drill debrief template.
2. WHEN the game-day drill begins, THE SYSTEM SHALL simulate a primary region failure by blocking traffic at the network layer (modifying the sandbox primary region ALB security group to deny all ingress) rather than actually terminating instances, so the simulation is reversible within 5 minutes.
3. WHEN the failover sequence is executed during the drill, THE SYSTEM SHALL record: `t_failure_injected`, `t_dns_cutover_complete`, `t_db_promotion_complete`, `t_app_healthy_in_dr`, and `t_failback_complete` timestamps; calculate measured RTO = `t_app_healthy_in_dr − t_failure_injected` and measured RPO = age of the youngest committed transaction present in the DR database.
4. WHEN the game-day debrief occurs, THE SYSTEM SHALL produce a written report within 48 hours documenting: measured RTO and RPO vs. targets, steps that exceeded their time budget, runbook gaps identified, and action items with owners and due dates — stored in `docs/game-day-reports/{date}-report.md`.
5. WHERE measured RTO or RPO fails to meet the target in two consecutive game-day drills, THE SYSTEM SHALL trigger a formal architecture review to determine whether warm-standby capacity must be increased, replication mechanisms need tuning, or the architecture pattern must be upgraded from warm standby to active/active for the affected components.

---

### Requirement 7: Architecture Documentation and Well-Architected Review

**User Story:** As a solutions architect, I want all DR architecture decisions and trade-offs to be documented in ADRs and reviewed against the AWS Well-Architected Framework Reliability pillar, so that future engineers can understand why the warm-standby pattern was chosen and how to evolve the architecture as requirements change.

#### Acceptance Criteria

1. WHEN the architecture documentation is produced, THE SYSTEM SHALL generate a draw.io diagram (using `drawio-ai generate --template aws-multi-region`) depicting both the primary and DR regions with all replication/failover paths labelled with estimated replication latency and RPO contribution, exported as both `architecture/multi-region-dr.drawio` and `architecture/multi-region-dr.png`.
2. WHEN Architecture Decision Records are authored, THE SYSTEM SHALL produce at minimum three ADRs: `adr-001-warm-standby-vs-pilot-light.md` (comparing recovery time, cost, and operational complexity), `adr-002-warm-standby-vs-active-active.md` (comparing consistency requirements, routing complexity, and cost), and `adr-003-rds-replica-vs-aurora-global.md` (comparing promotion time, replication lag, and licensing cost).
3. WHEN the Well-Architected review is conducted, THE SYSTEM SHALL produce a review document that maps each of the six Reliability pillar best-practice areas (foundations, workload architecture, change management, failure management, data durability, and testing) to the specific architectural decisions in this spec, with explicit answers to all Reliability pillar questions in the AWS Well-Architected Tool.
4. WHEN the System Architecture Document (SAD) is produced using the `architecture-doc` skill, THE SYSTEM SHALL include sections for: executive summary, in-scope components and their DR classification, RTO/RPO budget breakdown per component, replication topology, failover sequence, failback sequence, monitoring and alerting strategy, and known limitations.
5. WHERE the architecture deviates from an AWS Well-Architected best practice (e.g., no automated failover trigger), THE SYSTEM SHALL document the deviation explicitly in the SAD with the justification (e.g., split-brain risk mitigation requires human approval) and the compensating control in place.

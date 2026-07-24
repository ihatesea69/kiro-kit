# Implementation Plan: AWS Multi-Region Disaster Recovery

## Overview

This plan delivers the DR architecture artifacts in dependency order: Terraform module scaffolding, Route 53 failover wiring, RDS cross-region replica, S3 replication, DynamoDB global tables, monitoring and alerting, runbooks, the draw.io architecture diagram, end-to-end game-day verification in the sandbox environment, and final documentation (ADRs, Well-Architected review, SAD, architecture deck). Sub-tasks marked `- [ ]*` are verification/testing tasks. Estimated effort: 8–11 engineer-days for a single solutions architect or senior DevOps engineer.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Terraform project scaffolding and provider configuration
  - [ ] 1.1 Create the Terraform directory structure: `modules/route53-failover/`, `modules/rds-dr/`, `modules/s3-replication/`, `modules/dynamodb-global/`, `modules/monitoring/`, `environments/prod/`, `environments/sandbox/`; add `versions.tf` in each module pinning `hashicorp/aws ~> 5.50`.
  - [ ] 1.2 Configure `environments/prod/main.tf` with two provider aliases (`aws.primary` for `us-east-1`, `aws.dr` for `us-west-2`), an S3 backend block (bucket `example-tfstate-prod`, key `dr/terraform.tfstate`, DynamoDB lock table `example-tfstate-lock`), and root `module` blocks invoking each sub-module with the correct provider alias argument.
  - [ ] 1.3 Create `environments/sandbox/main.tf` as a mirror of the prod root module with reduced instance classes (e.g., `db.t4g.medium`, `t4g.small` EC2) and a separate S3 backend key `dr-sandbox/terraform.tfstate`; sandbox is the exclusive target for game-day drills.
  - [ ] 1.4 Configure `.tflint.hcl` to enable the `terraform` ruleset and the `aws` plugin ruleset; add a `checkov` pre-commit hook in `.pre-commit-config.yaml` running `checkov -d . --framework terraform`; add `terraform-docs` automation for all modules.
  - [ ]* 1.5 Run `terraform validate` and `terraform fmt -check` in all modules and environments; confirm zero errors before proceeding to subsequent tasks.
  - _Requirements: R7.1, R7.3_

- [ ] 2. Route 53 health checks and failover DNS records
  - [ ] 2.1 Implement `modules/route53-failover/main.tf` with `aws_route53_health_check` resources for both the primary and DR region endpoints (`type = "HTTPS"`, `request_interval = 10`, `failure_threshold = 3`, `measure_latency = true`, `resource_path = "/health/live"`).
  - [ ] 2.2 Implement PRIMARY and SECONDARY `aws_route53_record` failover routing records in `modules/route53-failover/main.tf` with `ttl = 60`, each associated with its respective health check ID; declare `aws_sns_topic.dr_alerts` and `aws_cloudwatch_metric_alarm.hc_primary_unhealthy` that publishes to the SNS topic on health-check state change.
  - [ ] 2.3 Add `aws_sns_topic_subscription` in `modules/monitoring/main.tf` for PagerDuty HTTPS endpoint; configure `aws_cloudwatch_composite_alarm` that combines the Route 53 HC alarm with `ReplicaLag` CRITICAL alarm to produce a single `DR_RISK_HIGH` composite alert.
  - [ ]* 2.4 Run `tflint` and `checkov` against `modules/route53-failover/`; validate with `terraform validate`; run `terraform plan -var-file=../../environments/sandbox/terraform.tfvars` and confirm no resource deletions on an existing sandbox deployment.
  - _Requirements: R1.1, R1.2, R1.3, R1.5_

- [ ] 3. RDS cross-region read replica
  - [ ] 3.1 Implement `modules/rds-dr/main.tf` with `aws_db_instance` using `replicate_source_db = var.primary_db_arn` (full ARN for cross-region), `provider = aws.dr`, `multi_az = true`, `storage_encrypted = true`, `auto_minor_version_upgrade = false`, `backup_retention_period = 7`, `backup_window = "02:00-03:00"`, `lifecycle { prevent_destroy = true }`.
  - [ ] 3.2 Add `aws_cloudwatch_metric_alarm.rds_replica_lag_warning` (threshold 60 s) and `aws_cloudwatch_metric_alarm.rds_replica_lag_critical` (threshold 240 s), both publishing to `var.dr_sns_topic_arn`, in `modules/rds-dr/main.tf`.
  - [ ] 3.3 Write `scripts/promote-rds.sh`: pre-condition check (`aws rds describe-db-instances ... | jq '.DBInstances[0].DBInstanceStatus'` must be `available`); invoke `aws rds promote-read-replica --db-instance-identifier $REPLICA_ID --region us-west-2`; poll every 30 seconds with a 12-minute timeout; exit 0 on `available`, exit 1 on timeout with an error message directing to escalation.
  - [ ]* 3.4 Apply `modules/rds-dr/` in the sandbox environment; verify the replica appears in `us-west-2` RDS console in `available` state; confirm `ReplicaLag` CloudWatch metric is publishing data; trigger the WARNING alarm by pausing replication (stop primary writes for 70 seconds) and confirm SNS notification is received.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5_

- [ ] 4. S3 cross-region replication
  - [ ] 4.1 Implement `modules/s3-replication/main.tf` with `aws_iam_role` and `aws_iam_policy` scoped to the exact source and destination bucket ARNs (no wildcards); attach the policy; add `aws_s3_bucket_versioning` on both source and destination buckets (required for replication).
  - [ ] 4.2 Implement `aws_s3_bucket_replication_configuration` with RTC enabled (`replication_time { status = "Enabled", time { minutes = 15 } }`, `metrics { status = "Enabled", event_threshold { minutes = 15 } }`), `storage_class = "STANDARD_IA"` at destination, and `delete_marker_replication { status = "Disabled" }` for buckets tagged `dr_delete_protection = "true"`.
  - [ ] 4.3 Add CloudWatch alarm on `ReplicationFailedOperations > 0` for each replicated bucket; document the S3 Batch Replication initial-seeding procedure (S3 Batch Operations job targeting all existing objects) as a runbook sub-step in `runbooks/failover-runbook.md` Appendix A.
  - [ ]* 4.4 Upload a 10 MB test object to the sandbox source bucket; confirm it appears in the DR destination bucket within 15 minutes; check the `ReplicationLatency` CloudWatch metric is below the 15-minute threshold; run `checkov` against `modules/s3-replication/`.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 5. DynamoDB global tables
  - [ ] 5.1 Implement `modules/dynamodb-global/main.tf` with `aws_dynamodb_table` for each application table, including `stream_enabled = true`, `stream_view_type = "NEW_AND_OLD_IMAGES"`, `point_in_time_recovery { enabled = true }`, `server_side_encryption { enabled = true }`, and a `replica { region_name = "us-west-2", point_in_time_recovery = true }` block.
  - [ ] 5.2 Add `aws_cloudwatch_metric_alarm` for `ReplicationLatency` p99 > 5000 ms (5 seconds) targeting the `us-west-2` receiving region; deploy a DynamoDB Streams Lambda function (`functions/ddb-conflict-logger/`) that logs `NEW_IMAGE` vs `OLD_IMAGE` discrepancies to CloudWatch Logs group `/aws/dynamodb/conflict-resolution/{table_name}`.
  - [ ] 5.3 For tables tagged `global_table = "false"`, ensure no `replica` block is present in Terraform and add a code comment documenting the explicit decision with reference to `adr-002`; include these tables in the architecture diagram as region-local with the RPO annotation "data loss acceptable — session cache only".
  - [ ]* 5.4 Write an item to the sandbox DynamoDB global table from `us-east-1`; query the `us-west-2` replica within 5 seconds and confirm the item is present; check `ReplicationLatency` p99 < 1000 ms; confirm the conflict-logger Lambda invocation count is 0 (no conflicts in normal operation).
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [ ] 6. Monitoring, alerting, and RTO/RPO CloudWatch dashboard
  - [ ] 6.1 Implement `modules/monitoring/main.tf` with a `aws_cloudwatch_dashboard` resource named `DR-RTO-RPO-KPIs` containing widgets for: Route 53 HC status (both regions), RDS `ReplicaLag` (time-series, 24 h), S3 `ReplicationLatency` (time-series), DynamoDB `ReplicationLatency` p99 (time-series), and a text widget showing the current RTO/RPO targets (15 min / 5 min) for quick operator reference.
  - [ ] 6.2 Configure `aws_sns_topic.dr_alerts` with email subscription to the `#dr-on-call` distribution list and HTTPS subscription to the PagerDuty Events API V2 endpoint; add a `aws_cloudwatch_composite_alarm` named `DR_RISK_HIGH` that fires when the Route 53 HC alarm AND either the RDS lag critical alarm OR the S3 replication failed operations alarm are simultaneously active.
  - [ ]* 6.3 Manually trigger a test SNS notification from the `dr_alerts` topic; confirm delivery to the PagerDuty integration and the email subscription; open the `DR-RTO-RPO-KPIs` dashboard in the AWS console and confirm all widgets are displaying data with no missing-metric gaps.
  - _Requirements: R1.5, R2.2, R5.5, R6.1_

- [ ] 7. Failover and failback runbooks
  - [ ] 7.1 Author `runbooks/failover-runbook.md` following the outline in `design.md`; every step must include: the exact AWS CLI command with all flags and `--region` parameter, a pre-condition check command and expected output, the step's time budget, and an escalation path if the step fails or times out.
  - [ ] 7.2 Author `runbooks/failback-runbook.md` covering: primary region verification, reverse S3 replication setup (DR → primary for gap fill), `scripts/validate-db-consistency.sh` invocation and expected exit 0 output, Route 53 manual DNS restore (set SECONDARY record back to SECONDARY priority), and 30-minute observation period.
  - [ ] 7.3 Author `runbooks/game-day-playbook.md` with: scope (sandbox only), pre-drill checklist (topology parity, dashboard access, role assignments), drill steps D-1 through D-10 from `design.md`, timestamp recording template, and post-drill debrief template producing `docs/game-day-reports/{date}-report.md`.
  - [ ]* 7.4 Conduct a tabletop walkthrough of `failover-runbook.md` with at least two engineers; time each step against budget; record any ambiguities or missing pre-condition checks; update the runbook before the first game-day drill.
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R6.1, R6.2_

- [ ] 8. Draw.io architecture diagram
  - [ ] 8.1 Generate the initial diagram using `drawio-ai generate --template aws-multi-region --output architecture/multi-region-dr.drawio`; the diagram must include both AWS regions as swimlanes, all components (ALB, ASG, RDS primary/replica, S3 buckets, DynamoDB global tables, Route 53, Secrets Manager, CloudWatch), and all replication/failover paths labelled with estimated replication latency and RPO contribution.
  - [ ] 8.2 Annotate the failover path (Route 53 DNS cutover arrow) with `"Auto: ≤ 90 s"`; annotate the RDS promotion arrow with `"Manual: ≤ 8 min"`; annotate the ASG scale-up arrow with `"Manual: ≤ 4 min"`; export the diagram as `architecture/multi-region-dr.png` using `drawio-ai export --format png --scale 2`.
  - [ ]* 8.3 Run `drawio-ai validate architecture/multi-region-dr.drawio --schema aws`; confirm the validator reports both AWS regions present, all six replication/failover paths labelled, and no unconnected nodes.
  - _Requirements: R7.1_

- [ ] 9. End-to-end game-day verification (sandbox)
  - [ ] 9.1 Apply the full Terraform configuration in `environments/sandbox/` (`terraform apply -var-file=terraform.tfvars -auto-approve`); confirm all resources are created without errors; run `terraform plan` a second time to confirm idempotency (exit code 0, no changes).
  - [ ] 9.2 Execute the game-day drill (playbook steps D-1 through D-10) in the sandbox environment; record all timestamps (`t_failure_injected`, `t_dns_cutover_complete`, `t_db_promotion_complete`, `t_app_healthy_in_dr`, `t_failback_complete`) in a timestamped drill log.
  - [ ]* 9.3 Verify measured RTO = `t_app_healthy_in_dr − t_failure_injected` ≤ 15 minutes; verify measured RPO = age of youngest committed transaction in DR database ≤ 5 minutes; if either target is missed, open a blocker issue before marking this task complete.
  - [ ]* 9.4 After failback, run `scripts/validate-db-consistency.sh` between the sandbox primary and the former DR replica; confirm exit code 0 (row counts and checksums match); run a second `terraform plan` in `environments/sandbox/` to confirm no configuration drift was introduced by the drill.
  - _Requirements: R6.2, R6.3, R6.4, R6.5_

- [ ] 10. Architecture documentation and final deliverables
  - [ ] 10.1 Author `docs/adrs/adr-001-warm-standby-vs-pilot-light.md`, `adr-002-warm-standby-vs-active-active.md`, and `adr-003-rds-replica-vs-aurora-global.md` using the MADR (Markdown Any Decision Records) template; each ADR must include: context, decision, consequences, and a cost/RTO/RPO comparison table drawn from the data in `design.md`.
  - [ ] 10.2 Author `docs/well-architected-review.md` with explicit answers to all 26 Reliability pillar questions from the AWS Well-Architected Tool; map each question to the specific Terraform resource or runbook step that addresses it; document the single deviation (human-gated failover) with its compensating control.
  - [ ] 10.3 Generate the System Architecture Document using the `architecture-doc` skill, providing `architecture/multi-region-dr.png` as the primary diagram; the SAD must include sections: executive summary, component DR classification table, RTO/RPO budget breakdown, replication topology, failover and failback sequences, monitoring strategy, known limitations, and appendix with ADR summaries.
  - [ ] 10.4 Generate an executive summary architecture deck using the `architecture-deck` skill (output: `docs/multi-region-dr-deck.pptx`); the deck must cover: DR strategy options and decision rationale (warm standby vs alternatives), architecture diagram, RTO/RPO targets and budget breakdown, replication topology summary, game-day results (populated after Task 9), and next steps (quarterly drill schedule, cost review cadence).
  - [ ] 10.5 Update `docs/system-architecture.md` to add the multi-region DR architecture as a top-level section, referencing the SAD, the draw.io diagram, and the three ADRs; update the component inventory table to include the DR region resources and their replication relationships.
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5_

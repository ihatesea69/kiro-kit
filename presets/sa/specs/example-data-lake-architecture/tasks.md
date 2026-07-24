# Implementation Plan: AWS Data Lake Architecture

## Overview

This plan delivers the data lake architecture artifacts in strict dependency order: repository scaffold and tooling, CloudFormation IaC (S3 buckets, Glue, Athena, Lake Formation), Glue ETL job scripts, CloudFormation linting and policy tests, sandbox deployment and end-to-end integration tests (deploy to sandbox, ingest sample dataset, verify Athena query and Lake Formation denies, `drawio-ai validate` on diagram), the draw.io infrastructure diagram, the Solution Architecture Document (docx via `architecture-doc` skill), a stakeholder presentation deck (pptx via `architecture-deck` skill), the Well-Architected review, and an update to `docs/system-architecture.md`. Sub-tasks marked `- [ ]*` are test tasks that must pass in CI before the corresponding artifact is considered complete. Estimated effort: 6–8 engineer-days for a single solutions architect / platform engineer.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Repository scaffold and tooling
  - [ ] 1.1 Create the directory structure: `infra/cloudformation/`, `glue/jobs/`, `docs/diagrams/`, `tests/cfn/`, `tests/integration/`, `scripts/` with `.gitkeep` files; add a `Makefile` with targets `lint`, `test-cfn`, `test-integration`, `deploy-sandbox`, and `docs`.
  - [ ] 1.2 Create `requirements-dev.txt` pinning `cfn-lint>=1.6`, `cfn-flip>=0.3`, `PyYAML>=6.0`, `boto3>=1.34`, `pytest>=8.2`, `pytest-cov>=5.0`, `pytest-timeout>=2.3`; document Python 3.11 as the required runtime.
  - [ ] 1.3 Add `.github/workflows/ci.yml` with jobs `lint-cfn` (`cfn-lint --include-checks W`), `test-cfn` (`pytest tests/cfn/ -v`), and `test-integration` (runs on `main` only, uses `AWS_ROLE_ARN` OIDC secret for sandbox assume-role); block merge on any job failure.
  - [ ] 1.4 Add a pre-commit hook via `.pre-commit-config.yaml` that runs `cfn-lint --include-checks W` on any staged `.yaml` file under `infra/cloudformation/`; install with `pre-commit install` and document in the repository `README.md`.
  - _Requirements: R6.1_

- [ ] 2. CloudFormation stack — S3 buckets, encryption, and lifecycle policies
  - [ ] 2.1 Create `infra/cloudformation/data-lake-stack.yaml`; add the `Parameters` section with `pEnvironment` (AllowedValues: dev, staging, prod), `pKmsKeyArn`, `pAlertSnsTopicArn`, `pAnalystRoleArn`, `pGlueEtlRoleArn`, and `pGlueScriptsBucket`; add stack-level resource tags (`Environment`, `Project`, `Owner`, `ManagedBy`).
  - [ ] 2.2 Add `RawBucket` with `BucketEncryption` (aws:kms, `pKmsKeyArn`), `VersioningConfiguration: Enabled`, all four `PublicAccessBlockConfiguration` properties true, and lifecycle rule: INTELLIGENT_TIERING at day 30, GLACIER at day 365, noncurrent-version expiration at day 90.
  - [ ] 2.3 Add `CuratedBucket` with the same encryption and versioning, and lifecycle rule: STANDARD_IA at day 60, GLACIER at day 180, noncurrent-version expiration at day 90.
  - [ ] 2.4 Add `ConsumptionBucket` with encryption and versioning; lifecycle rule: STANDARD_IA at day 90 (no Glacier transition); separate lifecycle rule for `athena-results/` prefix with `ExpirationInDays: 30`.
  - [ ] 2.5 Add `RawBucketPolicy`, `CuratedBucketPolicy`, and `ConsumptionBucketPolicy` with `DenyNonKmsUploads` (Deny `s3:PutObject` where `s3:x-amz-server-side-encryption != aws:kms`) and `DenyHTTP` (Deny `s3:*` where `aws:SecureTransport: false`) statements.
  - [ ] 2.6 Create `infra/cloudformation/stack-policy.json` denying `Update:Replace` and `Update:Delete` on `AWS::S3::Bucket`; create `scripts/deploy-stack-policy.sh` applying it via `aws cloudformation set-stack-policy`.
  - [ ]* 2.7 Run `cfn-lint --include-checks W infra/cloudformation/data-lake-stack.yaml` and assert zero findings; write `tests/cfn/test_lifecycle_rules.py` (PyYAML): assert Bronze INTELLIGENT_TIERING at day 30 and GLACIER at day 365; assert Gold has no GLACIER; assert `athena-results/` rule has `ExpirationInDays: 30`.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R6.1, R6.2, R6.3, R6.4, R6.5_

- [ ] 3. CloudFormation stack — Glue Data Catalog, crawlers, and CloudWatch alarms
  - [ ] 3.1 Add `GlueRawDatabase`, `GlueCuratedDatabase`, and `GlueConsumptionDatabase` `AWS::Glue::Database` resources with names from `!Sub "${pEnvironment}_datalake_raw"` (and `_curated`, `_consumption`) and description strings referencing their tier.
  - [ ] 3.2 Add `RawCrawler`, `CuratedCrawler`, and `ConsumptionCrawler` `AWS::Glue::Crawler` resources; each targets the corresponding S3 bucket prefix, sets `RecrawlPolicy.RecrawlBehavior: CRAWL_NEW_FOLDERS_ONLY`, and sets `SchemaChangePolicy: UpdateBehavior: UPDATE_IN_DATABASE, DeleteBehavior: LOG`.
  - [ ] 3.3 Add `GlueCrawlerFailureAlarm` and `GlueJobFailureAlarm` `AWS::CloudWatch::Alarm` resources on custom metrics `DataLake/Glue / GlueCrawlerFailure` and `DataLake/Glue / GlueJobFailure`; set `AlarmActions: [!Ref pAlertSnsTopicArn]`, `Period: 300`, `Threshold: 1`, `ComparisonOperator: GreaterThanOrEqualToThreshold`.
  - [ ]* 3.4 Re-run cfn-lint; write `tests/cfn/test_crawler_config.py` (PyYAML): assert each crawler resource has `RecrawlBehavior: CRAWL_NEW_FOLDERS_ONLY` and `UpdateBehavior: UPDATE_IN_DATABASE`; assert both alarm resources have a non-empty `AlarmActions` list.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R3.3_

- [ ] 4. CloudFormation stack — Athena workgroups and Lake Formation
  - [ ] 4.1 Add `AnalystWorkgroup` `AWS::Athena::WorkGroup` with `EnforceWorkGroupConfiguration: true`, `BytesScannedCutoffPerQuery: 10737418240`, SSE-KMS result path at `s3://{ConsumptionBucket}/athena-results/analyst/` using `pKmsKeyArn`, and `ResultReuseByAgeConfiguration: Enabled: true, MaxAgeInMinutes: 60`.
  - [ ] 4.2 Add `EtlAggregationWorkgroup` with `EnforceWorkGroupConfiguration: true` and SSE-KMS result path at `s3://{ConsumptionBucket}/athena-results/etl-aggregation/`; omit `BytesScannedCutoffPerQuery` (programmatic job with bounded input).
  - [ ] 4.3 Add `LFRawLocationRegistration`, `LFCuratedLocationRegistration`, and `LFConsumptionLocationRegistration` `AWS::LakeFormation::Resource` resources; set `UseServiceLinkedRole: false` and `RoleArn: !Ref pGlueEtlRoleArn` on each.
  - [ ] 4.4 Add `LFEtlCuratedGrant` (Permissions: [CREATE_TABLE, ALTER] on `{env}_datalake_curated` for `pGlueEtlRoleArn`), `LFEtlConsumptionGrant` (same for `{env}_datalake_consumption`), and `LFAnalystSelectGrant` (Permissions: [SELECT] on `{env}_datalake_consumption` for `pAnalystRoleArn`) as `AWS::LakeFormation::Permissions` resources.
  - [ ]* 4.5 Re-run cfn-lint; write `tests/cfn/test_workgroup_config.py`: assert `analyst` workgroup `BytesScannedCutoffPerQuery` equals 10737418240 and `MaxAgeInMinutes` equals 60; write `tests/cfn/test_lf_grants.py`: assert all three Lake Formation location registrations have `UseServiceLinkedRole: false` and non-empty `RoleArn`.
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4, R5.5_

- [ ] 5. Glue ETL job scripts
  - [ ] 5.1 Write `glue/jobs/bronze_to_silver.py` as a PySpark AWS Glue script: accept `--SOURCE_DATABASE`, `--SOURCE_TABLE`, `--TARGET_BUCKET`, `--RUN_DATE`; read via `glueContext.create_dynamic_frame.from_catalog()`; drop null-primary-key rows; cast timestamps to UTC; deduplicate on `(primary_key, event_timestamp)` keeping the latest record; call `df.repartition()` targeting 128–256 MB output files; write Snappy Parquet to the Silver prefix; write an ETL manifest JSON to `s3://{raw_bucket}/etl-manifests/bronze_to_silver/{run_id}.json`.
  - [ ] 5.2 Write `glue/jobs/silver_to_gold.py`: accept `--TRANSFORM_SQL`, `--TARGET_BUCKET`, `--DOMAIN`, `--AGGREGATE_NAME`, `--RUN_DATE`; read Silver tables into DataFrames; register as Spark temp views; execute `spark.sql(transform_sql)`; repartition; write Snappy Parquet to the Gold prefix; write ETL manifest JSON.
  - [ ] 5.3 Write `glue/jobs/common/manifest.py` as a shared helper module: `write_manifest(s3_client, bucket, prefix, run_id, job_name, input_count, output_count, rejected_count, status, error_msg) -> None`; serialise the manifest as JSON and call `s3_client.put_object()`; both ETL scripts import from this module.
  - [ ] 5.4 Add `GlueBronzeToSilverJob` and `GlueSilverToGoldJob` `AWS::Glue::Job` resources to the stack: `MaxRetries: 2`, `WorkerType: G.1X`, `NumberOfWorkers: 10`, `GlueVersion: "4.0"`, script path from `pGlueScriptsBucket` parameter via `!Sub`.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 6. Monitoring and manifest integrity
  - [ ] 6.1 Write `scripts/check_missing_manifests.py` using boto3: list `etl-manifests/bronze_to_silver/` and `etl-manifests/silver_to_gold/` in the Bronze bucket; for each expected `run_date` (passed as a CLI argument), assert a manifest JSON exists; exit non-zero and print missing dates if any are absent; register this script as a CloudWatch Events scheduled check (daily).
  - [ ] 6.2 Add a `AWS::CloudWatch::Dashboard` resource `DataLakeDashboard` to the stack with four widgets: Bronze bucket total object count (S3 metric `NumberOfObjects`), Silver bucket size in GB (`BucketSizeBytes`), Glue crawler last run duration, and Athena `TotalExecutionTime` p95 by workgroup; dashboard name `!Sub "${pEnvironment}-datalake"`.
  - [ ] 6.3 Add `AWS::CloudWatch::MetricFilter` resources on a CloudWatch Log Group for Glue ETL job logs: one filter for `status: FAILED` in ETL manifest log lines, emitting the `DataLake/Glue / GlueJobFailure` custom metric consumed by the CloudWatch alarm in task 3.3.
  - _Requirements: R3.3, R3.5_

- [ ] 6. End-to-end verification in sandbox account
  - [ ] 6.1 Deploy to sandbox: `aws cloudformation deploy --template-file infra/cloudformation/data-lake-stack.yaml --stack-name dev-datalake --parameter-overrides pEnvironment=dev ... --capabilities CAPABILITY_IAM`; apply stack policy via `scripts/deploy-stack-policy.sh`; assert stack reaches `CREATE_COMPLETE` status.
  - [ ] 6.2 Upload the two Glue ETL scripts (`bronze_to_silver.py`, `silver_to_gold.py`, and `common/manifest.py`) to `s3://{pGlueScriptsBucket}/glue/jobs/` using `aws s3 sync glue/jobs/ s3://{pGlueScriptsBucket}/glue/jobs/`; confirm the Glue job `ScriptLocation` resolves correctly by checking the job definition in the Glue console.
  - [ ] 6.3 Write `tests/integration/test_ingest_crawl_query.py`: upload 10 sample Parquet files to the Bronze path via boto3; trigger `raw_crawler`; poll until crawler state is `READY`; assert Glue catalog table `{env}_datalake_raw.sample_events` exists with the expected column count; run `SELECT COUNT(*) FROM {env}_datalake_raw.sample_events` on the `etl-aggregation` workgroup; assert row count matches the uploaded dataset.
  - [ ]* 6.4 Write `tests/integration/test_lf_deny.py`: assume `pAnalystRoleArn` via `sts.assume_role()`; attempt `s3.get_object()` on a Silver object and assert `ClientError: AccessDenied`; then call `athena.start_query_execution` on a Gold table using the `analyst` workgroup and poll until state is `SUCCEEDED`.
  - [ ]* 6.5 Write `tests/integration/test_athena_scan_limit.py`: submit a full-table scan (no `WHERE event_date` predicate) on the `analyst` workgroup; poll until state is `CANCELLED` or `FAILED`; assert `StateChangeReason` contains `data scan limit`.
  - [ ]* 6.6 Write `tests/integration/test_bronze_to_silver_etl.py`: trigger `bronze_to_silver`; poll until run state is `SUCCEEDED`; assert Silver S3 path contains at least one `.snappy.parquet` file; assert ETL manifest exists and `rejected_record_count` equals 0.
  - [ ]* 6.7 Write `tests/integration/test_drawio_diagram.py`: run `drawio-ai validate docs/diagrams/data-lake-architecture.drawio`; assert exit code 0; parse XML with `xml.etree.ElementTree`; assert mxCell labels include "S3", "Glue", "Athena", and "Lake Formation".
  - [ ] 6.8 After all integration tests pass, tear down the sandbox stack: `aws cloudformation delete-stack --stack-name dev-datalake`; confirm all three S3 buckets are empty before deletion (the stack policy prevents deletion of non-empty buckets, so run `aws s3 rm s3://{bucket} --recursive` for each bucket first in the sandbox only).
  - _Requirements: R1.1, R2.1, R2.2, R3.1, R3.5, R4.2, R5.3, R6.1, R7.1_

- [ ] 7. Architecture diagram
  - [ ] 7.1 Invoke `drawio-ai generate --preset drawio-aws --output docs/diagrams/data-lake-architecture.drawio` with a structured description covering: three S3 tier swimlanes (Bronze / Silver / Gold), Glue crawlers and ETL jobs with directional arrows between tiers, two Athena workgroups (analyst, etl-aggregation) attached to the Gold tier, Lake Formation as a governance overlay spanning all three tiers, and the KMS CMK as a shared security resource connected to all buckets and Athena result paths.
  - [ ] 7.2 Review the generated diagram in the draw.io desktop app; verify swimlane labels, arrow directions, and AWS icon choices match the Mermaid component diagram in `design.md`; correct any misplaced shapes or missing connections; export a PNG to `docs/diagrams/data-lake-architecture.png` for embedding in the SAD.
  - [ ] 7.3 Commit `docs/diagrams/data-lake-architecture.drawio` and `docs/diagrams/data-lake-architecture.png` to version control; add a note in `docs/diagrams/README.md` explaining how to regenerate the diagram using `drawio-ai generate` if the architecture changes.
  - _Requirements: R7.1_

- [ ] 8. Documentation — SAD, Well-Architected review, presentation deck, and system architecture update
  - [ ] 8.1 Write `docs/well-architected-review.md` covering all six pillars using the mapping table in `design.md`; expand Cost Optimization with the storage-class cost table and Athena scan cost estimates for the three scenarios; expand Security with per-control references to the corresponding CloudFormation resource names.
  - [ ] 8.2 Invoke the `architecture-doc` skill: `architecture-doc generate --input docs/well-architected-review.md --diagram docs/diagrams/data-lake-architecture.drawio --output docs/data-lake-sad.docx`; verify the DOCX contains: Executive Summary, Architecture Overview, Component Descriptions, Data Flow, Security Model, Cost Model, and Well-Architected Review sections.
  - [ ] 8.3 Invoke the `architecture-deck` skill to produce `docs/data-lake-deck.pptx` with six slides: Problem / Why a data lake, Architecture diagram, Tier design and data format decisions, Security model, Cost model with estimates table, and Deployment and operations guide.
  - [ ] 8.4 Update `docs/system-architecture.md` to add the data lake as a named component in the system architecture: reference the three S3 tiers (Bronze, Silver, Gold), Glue (crawlers + ETL jobs), Athena workgroups, Lake Formation governance layer, and the KMS CMK; link to `docs/data-lake-sad.docx` for the full design narrative.
  - [ ] 8.5 Conduct a final internal review of all artifacts: confirm `data-lake-stack.yaml` passes cfn-lint, the SAD PDF export opens cleanly, the pptx deck renders without missing fonts, and `docs/system-architecture.md` links resolve; create and assign a review checklist issue in the project tracker.
  - _Requirements: R7.1, R7.2, R7.3, R8.1, R8.2, R8.3_

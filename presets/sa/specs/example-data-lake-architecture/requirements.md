# Requirements Document

## Introduction

This document defines the requirements for an **AWS Data Lake Architecture** built on Amazon S3, AWS Glue, Amazon Athena, and AWS Lake Formation. The architecture follows a three-tier medallion model — raw (Bronze), curated (Silver), and consumption-ready (Gold) — with automated schema discovery via Glue crawlers, transformation via Glue ETL jobs, governed access via Lake Formation column- and row-level permissions, and cost-optimised storage via S3 lifecycle policies that transition data through Intelligent-Tiering, Standard-IA, and Glacier Flexible Retrieval storage classes.

Deliverables of this specification are architecture artifacts: a draw.io infrastructure diagram (produced via the `drawio-ai` CLI using the `drawio-aws` skill), a CloudFormation stack covering S3 buckets, Glue databases and crawlers, Athena workgroups, and Lake Formation grants, a Solution Architecture Document (SAD, produced via the `architecture-doc` skill as a `.docx`), and a Well-Architected review report covering all six pillars with deep analysis of the Cost Optimization and Security pillars.

## Glossary

| Term | Definition |
|------|-----------|
| Bronze | The raw data tier (S3 prefix `raw/`); stores data exactly as received from source systems, partitioned by ingestion date. Never overwritten. |
| Silver | The curated data tier (S3 prefix `curated/`); stores validated, deduplicated, and standardised data in Parquet format with partition pruning applied. |
| Gold | The consumption tier (S3 prefix `consumption/`); stores domain-specific aggregates and denormalised views optimised for Athena query performance. |
| Glue Crawler | An AWS Glue component that scans S3 paths, infers schema, and writes or updates table definitions in the Glue Data Catalog. |
| Glue ETL Job | An Apache Spark job managed by AWS Glue that reads from one S3 tier, applies transformations, and writes Parquet output to the next tier. |
| Glue Data Catalog | A centralised metadata store for table schemas, partition keys, and data locations; shared with Athena and Lake Formation. |
| Athena Workgroup | An Athena configuration object that isolates query execution, enforces per-workgroup query result S3 paths, and applies per-query or per-workgroup data scan cost controls. |
| Lake Formation | An AWS service that provides fine-grained data access control (database-, table-, column-, and row-level) on top of the Glue Data Catalog and S3 data. |
| Lake Formation Grant | A Lake Formation permission that gives an IAM principal (user, role, or group) specific privileges (SELECT, ALTER, etc.) on a Glue catalog resource. |
| S3 Intelligent-Tiering | An S3 storage class that automatically moves objects between frequent-access and infrequent-access tiers based on access patterns, with no retrieval fees. |
| Glacier Flexible Retrieval | An S3 storage class for archival data with retrieval times of minutes to hours and very low per-GB storage cost. |
| Partition Pruning | Athena's ability to read only the S3 partitions relevant to a query predicate (e.g., `WHERE event_date = '2025-01-01'`), dramatically reducing scanned data and cost. |
| cfn-lint | The official AWS CloudFormation linter (`cloudformation-lint`) used to validate template syntax and resource properties before deployment. |
| drawio-ai | A CLI tool that generates draw.io diagram XML from a text description and AWS-icon-aware prompts; integrates with the `drawio-aws` preset skill. |

## Out of Scope

- Real-time streaming ingestion (Kinesis Data Streams, Kinesis Firehose); this architecture covers batch ingestion only.
- Custom Glue custom connectors or JDBC sources; data arrives in S3 via upstream ETL pipelines.
- Amazon Redshift Spectrum or EMR integration; all query serving uses Athena exclusively.
- Multi-account Lake Formation configurations (LF-Tags shared via AWS RAM); all resources reside in a single AWS account.
- Data quality frameworks beyond schema validation (e.g., Great Expectations, Deequ); data quality is enforced in Glue ETL job logic.
- Fine-grained row-level Lake Formation filters beyond partition-key equality predicates.
- Cost allocation tags and AWS Cost Explorer dashboards; cost monitoring is addressed in the Well-Architected review but not deployed as an artifact.

## Requirements

### Requirement 1: Three-Tier S3 Storage with Lifecycle Policies and Encryption

**User Story:** As a platform engineer, I want the three data lake tiers (Bronze, Silver, Gold) stored in separate S3 buckets with server-side encryption, versioning, and lifecycle policies, so that data is durably stored, automatically transitioned to cheaper storage classes as it ages, and protected against accidental deletion.

#### Acceptance Criteria

1. WHEN the CloudFormation stack is deployed, THE SYSTEM SHALL create three S3 buckets named `{env}-datalake-raw-{account_id}`, `{env}-datalake-curated-{account_id}`, and `{env}-datalake-consumption-{account_id}`, each with `BucketEncryption` using `aws:kms` with a customer-managed KMS key ARN from the stack parameter `pKmsKeyArn`, and `VersioningConfiguration: Status: Enabled`.
2. WHEN an object is created in the Bronze bucket, THE SYSTEM SHALL apply a lifecycle rule that transitions objects to `INTELLIGENT_TIERING` after 30 days, to `GLACIER` after 365 days, and expires noncurrent object versions after 90 days.
3. WHEN an object is created in the Silver bucket, THE SYSTEM SHALL apply a lifecycle rule that transitions objects to `STANDARD_IA` after 60 days and to `GLACIER` after 180 days.
4. WHEN an object is created in the Gold bucket, THE SYSTEM SHALL apply a lifecycle rule that transitions objects to `STANDARD_IA` after 90 days; Gold data is never transitioned to Glacier because it is required for low-latency Athena queries.
5. WHEN the stack is deployed, THE SYSTEM SHALL attach a bucket policy to each bucket that denies `s3:PutObject` requests where the request header `x-amz-server-side-encryption` is absent or set to `AES256` (enforcing KMS-only encryption), and denies all requests using `aws:SecureTransport: false` (enforcing HTTPS).
6. WHEN the stack is deployed, THE SYSTEM SHALL enable S3 Block Public Access on all three buckets (`BlockPublicAcls: true`, `BlockPublicPolicy: true`, `IgnorePublicAcls: true`, `RestrictPublicBuckets: true`).

---

### Requirement 2: Glue Data Catalog — Databases, Crawlers, and Schema Discovery

**User Story:** As a data engineer, I want Glue crawlers to automatically discover and register table schemas for each data tier in the Glue Data Catalog, so that Athena and Lake Formation can immediately query newly landed data without manual DDL work.

#### Acceptance Criteria

1. WHEN the CloudFormation stack is deployed, THE SYSTEM SHALL create three Glue databases (`{env}_datalake_raw`, `{env}_datalake_curated`, `{env}_datalake_consumption`) and three corresponding Glue crawlers, each configured with the matching S3 target path as its source and with `RecrawlPolicy: RecrawlBehavior: CRAWL_NEW_FOLDERS_ONLY` to avoid full rescans on large datasets.
2. WHEN a Glue crawler run completes successfully, THE SYSTEM SHALL update or create Glue table definitions in the corresponding database, inferring column names, data types, and Parquet partition keys (`event_date`, `source_system`) from the S3 folder structure and file metadata.
3. WHEN a crawler is invoked on a path that contains a mix of Parquet files with schema evolution (new columns added in a subset of partitions), THE SYSTEM SHALL apply the `MERGE` schema update behaviour so that new columns are added to the existing table definition without dropping previously defined columns.
4. WHEN a crawler run fails due to an S3 access error, THE SYSTEM SHALL emit a CloudWatch metric `GlueCrawlerFailure` with dimensions `CrawlerName` and `Database` and trigger a CloudWatch Alarm that sends a notification to the `pAlertSnsTopicArn` SNS topic configured in the stack parameters.
5. WHEN Glue ETL jobs write Silver or Gold data, THE SYSTEM SHALL write Parquet files partitioned by `event_date=YYYY-MM-DD/source_system=<name>/` so that crawlers detect partitions as Hive-style partition keys and Athena can apply partition pruning.

---

### Requirement 3: Glue ETL Jobs — Bronze-to-Silver and Silver-to-Gold Transformations

**User Story:** As a data engineer, I want parameterised Glue ETL jobs that transform raw Bronze data into curated Silver Parquet and then into domain-aggregated Gold Parquet, so that each tier is automatically populated without manual Spark coding per dataset.

#### Acceptance Criteria

1. WHEN the Bronze-to-Silver ETL job (`bronze_to_silver`) is triggered, THE SYSTEM SHALL read the Glue catalog table for the specified source dataset, apply schema validation (reject rows with null primary keys, cast timestamps to ISO-8601 UTC), deduplicate on `(primary_key, event_timestamp)` keeping the latest record, and write the output as Snappy-compressed Parquet to the Silver bucket under `curated/{dataset_name}/event_date={run_date}/`.
2. WHEN the Silver-to-Gold ETL job (`silver_to_gold`) is triggered, THE SYSTEM SHALL read one or more Silver tables from the Glue catalog, apply the configured SQL aggregation (passed as a job parameter `--TRANSFORM_SQL`), and write the result as Snappy-compressed Parquet to the Gold bucket under `consumption/{domain}/{aggregate_name}/event_date={run_date}/`.
3. WHEN a Glue ETL job fails after its first attempt, THE SYSTEM SHALL retry the job automatically up to 2 times (configurable via the Glue job `MaxRetries` property), with a 5-minute delay between retries, and emit a CloudWatch metric `GlueJobFailure` after all retries are exhausted.
4. WHEN Glue ETL jobs write Parquet output, THE SYSTEM SHALL use a Spark partition count tuned so that each output Parquet file is between 128 MB and 256 MB, avoiding small-file problems that inflate Athena per-request overhead and S3 request costs.
5. WHEN a Glue ETL job run completes, THE SYSTEM SHALL write a run manifest to `s3://{env}-datalake-raw-{account_id}/etl-manifests/{job_name}/{run_id}.json` containing: job name, run ID, source table, input record count, output record count, rejected record count, start time, end time, and output S3 path.

---

### Requirement 4: Athena Workgroups and Query Cost Controls

**User Story:** As a platform engineer, I want separate Athena workgroups for analysts and for ETL-driven aggregation queries, with per-query data scan limits and dedicated result buckets, so that runaway analyst queries cannot consume unbounded Athena scan cost and query results are isolated by team.

#### Acceptance Criteria

1. WHEN the CloudFormation stack is deployed, THE SYSTEM SHALL create two Athena workgroups: `analyst` (for human ad-hoc queries) and `etl-aggregation` (for programmatic Gold-tier refresh queries), each configured with `EnforceWorkGroupConfiguration: true` so that client-side settings cannot override workgroup policies.
2. WHEN a query is submitted to the `analyst` workgroup, THE SYSTEM SHALL enforce a `BytesScannedCutoffPerQuery` of 10 GB; any query that would scan more data is cancelled automatically and the submitter receives an Athena query-cancelled error.
3. WHEN a query completes in either workgroup, THE SYSTEM SHALL write query results to the workgroup-specific result bucket path: `s3://{env}-datalake-consumption-{account_id}/athena-results/{workgroup}/` with SSE-KMS encryption using `pKmsKeyArn`.
4. WHEN the `analyst` workgroup is deployed, THE SYSTEM SHALL enable Athena query result reuse with a `ResultReuseByAgeEnabled` TTL of 60 minutes so that identical repeated queries served from cache do not incur additional scan cost.
5. WHEN a user queries a Gold table without a partition filter predicate on `event_date`, THE SYSTEM SHALL rely on the partitioned Parquet layout to enable Athena partition pruning, and the Glue crawler registration shall ensure partition metadata is present in the catalog so that Athena does not fall back to a full table scan.

---

### Requirement 5: Lake Formation Governance and Least-Privilege Access Control

**User Story:** As a security engineer, I want Lake Formation to enforce least-privilege access on the Glue Data Catalog so that analysts can only read Gold-tier tables in their domain, ETL service roles can only write to their target tier, and no IAM principal can bypass Lake Formation grants by using direct S3 API calls.

#### Acceptance Criteria

1. WHEN the CloudFormation stack is deployed, THE SYSTEM SHALL register each S3 bucket path (`s3://{env}-datalake-raw-{account_id}/`, `s3://{env}-datalake-curated-{account_id}/`, `s3://{env}-datalake-consumption-{account_id}/`) as a Lake Formation data location, backed by a dedicated Lake Formation service-linked role with a scoped IAM policy that grants `s3:GetObject`, `s3:PutObject`, and `s3:ListBucket` only on the registered path.
2. WHEN Lake Formation database-level permissions are configured, THE SYSTEM SHALL grant the Glue ETL service role (`pGlueEtlRoleArn`) `CREATE_TABLE` and `ALTER` on the target database only (Silver role gets Silver database only; Gold role gets Gold database only), with no cross-tier database access.
3. WHEN Lake Formation table-level permissions are configured, THE SYSTEM SHALL grant the analyst IAM role (`pAnalystRoleArn`) `SELECT` on all tables in `{env}_datalake_consumption` and deny all access to `{env}_datalake_raw` and `{env}_datalake_curated`, enforcing that analysts never access raw or partially processed data.
4. WHEN the Lake Formation data location is registered, THE SYSTEM SHALL set `UseServiceLinkedRole: false` and explicitly specify `RoleArn` so that Lake Formation uses a customer-managed role whose permissions can be audited and restricted independently of the Lake Formation service default.
5. WHEN an IAM principal attempts to call `s3:GetObject` directly on a Bronze or Silver S3 path without going through Athena and Lake Formation, THE SYSTEM SHALL deny the request via the bucket policy condition `StringNotEquals aws:PrincipalArn [pGlueEtlRoleArn, pLakeFormationServiceRoleArn]`, ensuring that Lake Formation is the only authorised read path for curated data.

---

### Requirement 6: CloudFormation Stack and IaC Artifact Delivery

**User Story:** As a platform engineer, I want the entire data lake infrastructure defined as a CloudFormation template that can be deployed repeatedly across environments (dev, staging, prod), so that environment parity is enforced and all resource configurations are version-controlled.

#### Acceptance Criteria

1. WHEN the CloudFormation template is synthesised, THE SYSTEM SHALL pass `cfn-lint --include-checks W` validation with zero errors and zero warnings, including the `W3002` check for S3 bucket name length and the `E3012` check for parameter type correctness.
2. WHEN the stack is deployed with `--parameter-overrides pEnvironment=dev`, THE SYSTEM SHALL create all resources with `dev` as the name prefix and tag every resource with `Environment=dev`, `Project=DataLake`, `Owner=platform-team`, and `ManagedBy=CloudFormation`.
3. WHEN the stack is updated to change a lifecycle rule transition day count, THE SYSTEM SHALL apply the change as an in-place update to the S3 bucket resource without replacement, because only `LifecycleConfiguration` is changing.
4. WHEN a stack deployment is initiated, THE SYSTEM SHALL enforce a stack policy that denies `Update:Replace` and `Update:Delete` actions on the S3 bucket resources, preventing accidental data loss from stack updates that would recreate a bucket.
5. WHEN the stack is deployed to a new AWS account or region, THE SYSTEM SHALL require only four parameters — `pEnvironment`, `pKmsKeyArn`, `pAlertSnsTopicArn`, and `pAnalystRoleArn` — and all other resource names shall be derived from these parameters using CloudFormation `!Sub` substitutions.

---

### Requirement 7: Architecture Diagram and Solution Architecture Document

**User Story:** As a solutions architect, I want a draw.io AWS architecture diagram and a Solution Architecture Document (SAD) that capture the data flow, tier structure, security boundaries, and cost model, so that stakeholders can review and approve the design before deployment.

#### Acceptance Criteria

1. WHEN the `drawio-ai` CLI is invoked with the `drawio-aws` skill and the architecture description, THE SYSTEM SHALL produce a `docs/diagrams/data-lake-architecture.drawio` file containing an AWS-icon diagram that shows: the three S3 tiers (Bronze/Silver/Gold) as distinct swimlanes, Glue crawlers and ETL jobs with directional arrows, Athena workgroups connected to the Gold tier, Lake Formation as a governance overlay, and the KMS key as a shared security resource.
2. WHEN the `architecture-doc` skill is invoked, THE SYSTEM SHALL produce a `docs/data-lake-sad.docx` file containing: an Executive Summary, Architecture Overview (referencing the draw.io diagram), Component Descriptions (S3, Glue, Athena, Lake Formation, KMS), Data Flow (Bronze → Silver → Gold), Security Model (encryption, Lake Formation, bucket policies), Cost Model (storage class transitions, Athena scan cost table), and Well-Architected Review (all six pillars).
3. WHEN the SAD is reviewed, THE SYSTEM SHALL include a cost estimate table with three scenarios — 10 TB Bronze / 5 TB Silver / 1 TB Gold daily ingest volume — showing estimated monthly S3 storage costs by storage class, estimated monthly Athena scan costs at an assumed $5/TB scan rate, and estimated Glue DPU-hours for the ETL jobs.

---

### Requirement 8: Well-Architected Review — Cost Optimization and Security Pillars

**User Story:** As a solutions architect, I want a Well-Architected review that documents how the data lake design addresses all six pillars, with particular depth on Cost Optimization and Security, so that the design can be formally reviewed against AWS best practices.

#### Acceptance Criteria

1. WHEN the Well-Architected review artifact is produced, THE SYSTEM SHALL map each of the six AWS Well-Architected pillars (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability) to at least two specific design decisions in this architecture, using the pillar's official question identifiers where applicable.
2. WHEN the Cost Optimization pillar is reviewed, THE SYSTEM SHALL document: S3 storage class transitions reducing per-GB cost for Bronze data older than 30 days by transitioning to Intelligent-Tiering (eliminating manual access-pattern guessing), Glacier transitions for data older than 365 days reducing cost to approximately $0.004/GB/month, Athena workgroup `BytesScannedCutoffPerQuery` preventing runaway scans, Parquet + Snappy compression reducing Athena scan volume by 60–80 % compared to raw CSV, and partition pruning on `event_date` further reducing scan volume for time-bounded queries.
3. WHEN the Security pillar is reviewed, THE SYSTEM SHALL document: KMS customer-managed key encryption at rest for all three S3 tiers and Athena results, TLS enforcement via bucket policy `aws:SecureTransport` condition, Lake Formation least-privilege grants replacing broad IAM `s3:*` policies, S3 Block Public Access preventing accidental public exposure, and the principle that no IAM user or role can bypass Lake Formation to read curated data directly from S3.

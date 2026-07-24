# Requirements Document

## Introduction

This document defines the requirements for a **Classic AWS Three-Tier Web Architecture** that delivers a production-ready, highly available, and scalable infrastructure baseline on AWS. The architecture partitions compute responsibility across three distinct tiers: a public-facing load balancer tier, a private application tier running containerised workloads on Amazon ECS Fargate, and an isolated data tier backed by Amazon RDS for PostgreSQL with Multi-AZ replication.

All resources are provisioned within a dedicated Amazon VPC spanning at least two Availability Zones, with public, private, and data subnets in each AZ. NAT Gateways provide internet egress for the private tier. Security groups enforce the principle of least privilege between tiers. Amazon CloudWatch provides unified observability across all tiers.

The deliverables of this specification are **architecture artifacts**: a draw.io network diagram (produced with the `drawio-ai` CLI and AWS shape libraries), a modular CloudFormation template set (`infra/cloudformation/*.yaml` with nested stacks for network, compute, and data), a Solution Architecture Document (docx produced with the `architecture-doc` skill), and a structured Well-Architected review covering all six pillars.

## Glossary

| Term | Definition |
|------|-----------|
| VPC | Amazon Virtual Private Cloud; an isolated virtual network within an AWS Region in which all infrastructure resources reside. |
| Public Subnet | A subnet whose route table contains a default route to the Internet Gateway, enabling inbound internet traffic and ALB placement. |
| Private Subnet | A subnet with no inbound internet route; egress-only internet access is provided via a NAT Gateway in the corresponding public subnet. |
| Data Subnet | A subnet isolated from all internet and NAT routes, used exclusively for the RDS cluster; no internet egress is provided. |
| AZ | Availability Zone; an isolated physical data-centre location within an AWS Region. Resources are spread across two or more AZs for fault tolerance. |
| ALB | Application Load Balancer; an AWS Layer-7 load balancer that distributes HTTP/HTTPS requests across ECS tasks in the application tier. |
| ECS Fargate | Amazon Elastic Container Service using the Fargate launch type; runs containerised application tasks without requiring EC2 instance management. |
| Target Group | An ALB resource that routes requests to registered ECS tasks; health checks are configured on a path and interval per target group. |
| RDS Multi-AZ | An RDS deployment mode that maintains a synchronous standby replica in a second AZ for automatic failover with zero data loss. |
| NAT Gateway | A managed AWS service placed in a public subnet that provides outbound-only internet access for resources in private subnets. |
| Security Group | A stateful virtual firewall attached to AWS resources; controls inbound and outbound traffic by protocol, port, and source/destination security group. |
| CIDR Block | Classless Inter-Domain Routing notation defining the IP address range of a VPC or subnet (e.g., `10.0.0.0/16`). |
| Nested Stack | A CloudFormation stack created as a resource within a parent stack using `AWS::CloudFormation::Stack`, enabling modular IaC composition. |
| Well-Architected | The AWS Well-Architected Framework; six pillars (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimisation, Sustainability) used to evaluate architecture quality. |
| SAD | Solution Architecture Document; a docx artifact describing the architecture, design decisions, and operational procedures for stakeholder review. |

## Out of Scope

- Application source code, Dockerfile authoring, and container image build pipelines; this specification covers infrastructure provisioning only.
- AWS WAF, Shield Advanced, and DDoS protection configuration beyond default ALB-level protections.
- CI/CD pipelines for application deployment (CodePipeline, CodeDeploy, GitHub Actions); those are covered by a separate spec.
- Cost estimation and Reserved Instance or Savings Plan purchasing decisions.
- DNS configuration in Route 53 and ACM certificate issuance beyond referencing an existing certificate ARN.
- Multi-Region active-active or disaster-recovery configurations; this specification covers a single-Region, two-AZ deployment.

## Requirements

### Requirement 1: VPC and Multi-AZ Network Topology

**User Story:** As a solutions architect, I want the VPC to be partitioned into public, private, and data subnet tiers across at least two Availability Zones, so that each architectural tier is network-isolated and the infrastructure tolerates a single AZ failure without service interruption.

#### Acceptance Criteria

1. WHEN the network CloudFormation stack is deployed, THE SYSTEM SHALL create a VPC with CIDR `10.0.0.0/16`, enable DNS resolution (`EnableDnsSupport: true`) and DNS hostnames (`EnableDnsHostnames: true`), and attach a single Internet Gateway.
2. WHEN the VPC is provisioned, THE SYSTEM SHALL create two public subnets (`10.0.0.0/24` in AZ-a, `10.0.1.0/24` in AZ-b), two private subnets (`10.0.10.0/24` in AZ-a, `10.0.11.0/24` in AZ-b), and two data subnets (`10.0.20.0/24` in AZ-a, `10.0.21.0/24` in AZ-b), each tagged with `Tier: public | private | data`.
3. WHEN public subnets are created, THE SYSTEM SHALL associate them with a route table that contains a default route (`0.0.0.0/0`) to the Internet Gateway and set `MapPublicIpOnLaunch: false` on both subnets.
4. WHEN private subnets are created, THE SYSTEM SHALL associate each with a per-AZ route table containing a default route (`0.0.0.0/0`) to the NAT Gateway in the corresponding public subnet, so that a single-AZ NAT failure does not route traffic across AZs.
5. WHEN data subnets are created, THE SYSTEM SHALL confirm that their route tables contain only the local VPC route (`10.0.0.0/16`) with no route to any Internet Gateway or NAT Gateway.
6. WHEN the network stack completes, THE SYSTEM SHALL export VPC ID, all six subnet IDs, NAT Gateway IDs, and Internet Gateway ID as CloudFormation Outputs so that compute and data stacks can import them without hard-coding resource identifiers.

---

### Requirement 2: Application Load Balancer Configuration

**User Story:** As a solutions architect, I want the ALB to terminate HTTPS, perform health checks on the application tier, and distribute traffic across both AZs, so that clients receive TLS-encrypted responses and the ALB removes unhealthy targets automatically.

#### Acceptance Criteria

1. WHEN the compute CloudFormation stack is deployed, THE SYSTEM SHALL create an internet-facing ALB in the two public subnets, attached to a dedicated `AlbSecurityGroup` that permits inbound `TCP/443` and `TCP/80` from `0.0.0.0/0` and permits outbound `TCP/8080` to the `AppSecurityGroup` only.
2. WHEN the ALB is created, THE SYSTEM SHALL attach an HTTPS listener on port 443 using the ACM certificate ARN supplied via the `CertificateArn` CloudFormation parameter, with a default action that forwards requests to the `AppTargetGroup`.
3. WHEN the HTTPS listener is created, THE SYSTEM SHALL also attach an HTTP listener on port 80 with a redirect action to `HTTPS://#{host}:443/#{path}?#{query}` with status code `HTTP_301`.
4. WHEN the `AppTargetGroup` is created, THE SYSTEM SHALL configure it with `Protocol: HTTP`, `Port: 8080`, `TargetType: ip`, a health check on `GET /health` expecting HTTP `200`, `HealthyThresholdCount: 2`, `UnhealthyThresholdCount: 3`, and `HealthCheckIntervalSeconds: 30`.
5. WHEN the `AccessLogBucketName` parameter is supplied, THE SYSTEM SHALL enable ALB access logs to that S3 bucket with prefix `alb-logs/` and the bucket policy shall grant the ALB service account write access before the ALB resource is created.

---

### Requirement 3: ECS Fargate Application Tier

**User Story:** As a solutions architect, I want the application tier to run as ECS Fargate tasks in private subnets with auto-scaling based on CPU utilisation, so that the application tier scales horizontally without requiring management of EC2 instances.

#### Acceptance Criteria

1. WHEN the compute CloudFormation stack is deployed, THE SYSTEM SHALL create an ECS Cluster with Container Insights enabled, and a Task Definition with `RequiresCompatibilities: [FARGATE]`, CPU and memory specified by `TaskCpu` (default `512`) and `TaskMemory` (default `1024`) parameters, and a container definition pulling from the ECR URI in the `AppImageUri` parameter.
2. WHEN the ECS Task Definition is created, THE SYSTEM SHALL configure an `awslogs` log driver sending container logs to CloudWatch Log Group `/ecs/<StackName>/app` with `RetentionInDays: 30` and `awslogs-stream-prefix: ecs`.
3. WHEN the ECS Service is created, THE SYSTEM SHALL place tasks in the two private subnets, attach the `AppSecurityGroup`, set `AssignPublicIp: DISABLED`, register tasks with the `AppTargetGroup`, set `DesiredCount` to the `DesiredTaskCount` parameter (default `2`), and enable the deployment circuit breaker with automatic rollback.
4. WHEN the ECS Service is running, THE SYSTEM SHALL attach an Application Auto Scaling target with `MinCapacity: 2` and `MaxCapacity: 10`, and a target-tracking scaling policy that scales out when `ECSServiceAverageCPUUtilization` exceeds `70 %` for two consecutive 60-second evaluation periods.
5. WHEN a task fails its ALB health check three consecutive times, THE SYSTEM SHALL deregister the task from the target group and ECS shall replace it; if more than 50 % of tasks fail within a deployment, the circuit breaker shall roll back to the previous task definition revision.

---

### Requirement 4: RDS Multi-AZ PostgreSQL Data Tier

**User Story:** As a solutions architect, I want the database tier to run on Amazon RDS for PostgreSQL with Multi-AZ enabled and storage encryption, so that the database automatically fails over to the standby replica during an AZ outage without data loss.

#### Acceptance Criteria

1. WHEN the data CloudFormation stack is deployed, THE SYSTEM SHALL create an `AWS::RDS::DBInstance` with `Engine: postgres`, `EngineVersion: 16.3`, `DBInstanceClass` from the `DbInstanceClass` parameter (default `db.t3.micro`), `MultiAZ: true`, `StorageType: gp3`, `AllocatedStorage: 20`, `StorageEncrypted: true` with the KMS key ARN from the `DbKmsKeyArn` parameter.
2. WHEN the RDS instance is created, THE SYSTEM SHALL place it in an `AWS::RDS::DBSubnetGroup` that references the two data subnet IDs imported from the network stack, ensuring the database is never reachable from public subnets.
3. WHEN the RDS instance is created, THE SYSTEM SHALL set `BackupRetentionPeriod: 7`, `PreferredBackupWindow: 03:00-04:00`, `PreferredMaintenanceWindow: mon:04:00-mon:05:00`, `DeletionProtection: true`, and `AutoMinorVersionUpgrade: true`.
4. WHEN the database master credentials are required, THE SYSTEM SHALL source them from an `AWS::SecretsManager::Secret` with auto-generated password of 32 characters (excluding `/`, `@`, `"`); the ECS task role shall be granted `secretsmanager:GetSecretValue` on that secret ARN only.
5. WHEN `MultiAZ: true` is set and a simulated primary AZ failure is introduced, THE SYSTEM SHALL complete failover to the standby replica as evidenced by RDS event `RDS-EVENT-0006` within 120 seconds, with no data loss and the application reconnecting automatically via the unchanged endpoint DNS name.

---

### Requirement 5: Security Groups and Least-Privilege Network Controls

**User Story:** As a solutions architect, I want security groups to enforce strict tier-to-tier traffic rules using security group references rather than CIDR ranges, so that traffic between tiers is permitted only over the required protocols and ports and lateral movement within a tier is blocked.

#### Acceptance Criteria

1. WHEN the compute CloudFormation stack provisions security groups, THE SYSTEM SHALL create three security groups — `AlbSecurityGroup`, `AppSecurityGroup`, and `DbSecurityGroup` — each with a populated `GroupDescription` and explicit egress rules, overriding the default allow-all egress.
2. WHEN the `AppSecurityGroup` ingress rules are evaluated, THE SYSTEM SHALL permit `TCP/8080` from `AlbSecurityGroup` only; egress rules shall permit `TCP/5432` to `DbSecurityGroup` and `TCP/443` to `0.0.0.0/0` for NAT-routed AWS API calls, and no other rules shall exist.
3. WHEN the `DbSecurityGroup` is evaluated, THE SYSTEM SHALL permit `TCP/5432` inbound from `AppSecurityGroup` only and define zero outbound rules, giving the database instance no outbound connectivity.
4. WHEN any intra-VPC security group ingress rule is specified, THE SYSTEM SHALL use `SourceSecurityGroupId` referencing another security group ID rather than a CIDR block, with the sole exception of the `AlbSecurityGroup` internet-facing rules on ports 443 and 80.
5. WHEN CloudFormation drift detection is run on the deployed stacks, THE SYSTEM SHALL report zero drifted resources; a CloudWatch Events rule shall trigger a drift detection run daily and publish results to the `AlertTopicArn` SNS topic.

---

### Requirement 6: CloudWatch Observability

**User Story:** As a solutions architect, I want unified observability across all tiers through CloudWatch dashboards, alarms, and metric filters, so that on-call engineers can diagnose incidents without requiring direct infrastructure access.

#### Acceptance Criteria

1. WHEN the CloudFormation stacks are deployed, THE SYSTEM SHALL create a CloudWatch Dashboard named `<StackName>-overview` containing widgets for ALB `RequestCount`, `TargetResponseTime (p99)`, and `HTTPCode_ELB_5XX_Count`; ECS `CPUUtilization` and `MemoryUtilization`; and RDS `DatabaseConnections`, `ReadLatency`, `WriteLatency`, and `FreeStorageSpace`.
2. WHEN ALB `HTTPCode_ELB_5XX_Count` exceeds `10` in a 1-minute period for two consecutive evaluation periods, THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to the SNS topic ARN in `AlertTopicArn` with severity `CRITICAL`.
3. WHEN ECS `CPUUtilization` exceeds `85 %` for three consecutive 60-second evaluation periods, THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to `AlertTopicArn` with severity `WARNING`.
4. WHEN RDS `FreeStorageSpace` drops below `2 147 483 648` bytes (2 GiB), THE SYSTEM SHALL trigger a CloudWatch alarm that publishes to `AlertTopicArn` with severity `WARNING`.
5. WHEN ECS tasks emit structured JSON logs to `/ecs/<StackName>/app`, THE SYSTEM SHALL create a CloudWatch Logs Metric Filter that counts `level: ERROR` occurrences as metric `AppErrorCount` in the `Application` namespace, and a corresponding alarm that fires when `AppErrorCount` exceeds `5` in a 5-minute window for two consecutive evaluation periods.

---

### Requirement 7: CloudFormation Infrastructure-as-Code and Stack Architecture

**User Story:** As a solutions architect, I want all AWS resources defined in modular nested CloudFormation stacks with explicit parameter and output wiring, so that the network, compute, and data tiers can be deployed and updated independently without hard-coded identifiers.

#### Acceptance Criteria

1. WHEN the IaC artifacts are created, THE SYSTEM SHALL produce a root stack at `infra/cloudformation/root.yaml` that declares nested stacks for `network.yaml`, `compute.yaml`, and `data.yaml` using `AWS::CloudFormation::Stack`, passing outputs from the network stack as parameters to compute and data stacks via `!GetAtt NetworkStack.Outputs.<OutputKey>`.
2. WHEN any CloudFormation template is authored, THE SYSTEM SHALL pass `cfn-lint --include-checks W --template <file>` with exit code 0 and zero violations of severity WARNING or higher before the template is committed.
3. WHEN the root stack is deleted, THE SYSTEM SHALL respect `DeletionPolicy: Retain` on the RDS instance and the S3 access log bucket, leaving those two resources in place; all other resources shall be deleted in dependency order without manual intervention.
4. WHEN any parameter contains a sensitive value (KMS key ARN, ACM certificate ARN, SNS topic ARN), THE SYSTEM SHALL declare it with `NoEcho: true` in the parameter definition, and the parameter value shall not appear in CloudFormation stack events or resource metadata.
5. WHEN the root stack is deployed via `rain deploy infra/cloudformation/root.yaml --stack-name <name>`, THE SYSTEM SHALL reach `CREATE_COMPLETE` status in under 15 minutes with no nested stack entering `ROLLBACK` state during a clean first deployment to a sandbox account.

---

### Requirement 8: Architecture Documentation and Well-Architected Review

**User Story:** As a solutions architect, I want to produce a draw.io architecture diagram, a Solution Architecture Document, and a structured Well-Architected review, so that stakeholders can evaluate the design before provisioning and review findings inform future improvements.

#### Acceptance Criteria

1. WHEN the architecture diagram is produced, THE SYSTEM SHALL use `drawio-ai generate --library aws-general --output docs/architecture-diagram.drawio` to create a diagram containing all VPC components (Internet Gateway, subnets labelled with CIDR and tier, NAT Gateways, route table arrows), the ALB, ECS service, RDS Multi-AZ pair, and security group boundaries as swimlane containers.
2. WHEN the diagram is generated, THE SYSTEM SHALL run `drawio-ai export --format png --dpi 150 docs/architecture-diagram.drawio --output docs/architecture-diagram.png` and verify that the output file size is greater than 10 KB, confirming a non-empty render.
3. WHEN the Solution Architecture Document is produced, THE SYSTEM SHALL use the `architecture-doc` skill to generate `docs/solution-architecture-document.docx` containing: an executive summary, architecture overview with the embedded diagram PNG, per-tier component descriptions, CloudFormation parameter reference table, operational runbook for deploy / scale / failover, and a glossary matching this document.
4. WHEN the Well-Architected review is conducted, THE SYSTEM SHALL produce `docs/well-architected-review.md` with a table mapping each of the six pillars to at least three specific findings, classifying each as `IMPLEMENTED`, `PARTIAL`, or `RISK`, with a recommended remediation for every `PARTIAL` or `RISK` finding.
5. WHEN the architecture diagram is validated, THE SYSTEM SHALL run `drawio-ai validate docs/architecture-diagram.drawio --schema aws-three-tier` with exit code 0, confirming that all required AWS component types (Internet Gateway, ALB, ECS, RDS, NAT Gateway, VPC) are present in the diagram file.

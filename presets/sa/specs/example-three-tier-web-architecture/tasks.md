# Implementation Plan: AWS Three-Tier Web Architecture

## Overview

This plan produces the complete set of architecture artifacts for the classic AWS three-tier web architecture in strict dependency order: CloudFormation template scaffold and parameter schema, network stack, security groups, compute stack (ALB + ECS), data stack (RDS + Secrets Manager), CloudWatch observability, the draw.io architecture diagram, end-to-end sandbox deployment and smoke checks, and the final Solution Architecture Document and Well-Architected review. Sub-tasks marked `- [ ]*` are verification tasks that must pass before the subsequent task group begins. Estimated effort: 4–6 engineer-days for a single solutions architect.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Repository scaffold and CloudFormation parameter schema
  - [ ] 1.1 Create directory tree: `infra/cloudformation/`, `docs/`, with `.gitkeep` placeholders; initialise `infra/cloudformation/root.yaml` with `AWSTemplateFormatVersion: "2010-09-09"` and placeholder `Resources:` section for the three nested stacks.
  - [ ] 1.2 Define the shared parameter contract: document all cross-stack parameters (`NetworkStackName`, `ComputeStackName`, `CertificateArn`, `AppImageUri`, `TaskCpu`, `TaskMemory`, `DesiredTaskCount`, `AccessLogBucketName`, `AlertTopicArn`, `DbInstanceClass`, `DbKmsKeyArn`) in `infra/cloudformation/PARAMETERS.md` with type, default, `NoEcho` flag, and which template consumes each parameter.
  - [ ] 1.3 Install and pin toolchain: `cfn-lint>=1.12`, `cfn-nag>=0.6`, `rain>=1.8`, `drawio-ai>=0.5`; record versions in `infra/toolchain.txt`.
  - _Requirements: R7.1, R7.4_

- [ ] 2. Network stack (network.yaml)
  - [ ] 2.1 Author VPC, Internet Gateway, and VPCGatewayAttachment with `EnableDnsSupport: true` and `EnableDnsHostnames: true`; tag VPC with `Name: <StackName>-vpc`.
  - [ ] 2.2 Author the six subnets following the CIDR plan (`10.0.0.0/24`, `10.0.1.0/24` public; `10.0.10.0/24`, `10.0.11.0/24` private; `10.0.20.0/24`, `10.0.21.0/24` data); set `MapPublicIpOnLaunch: false` on all; tag each with `Tier` and `AZ`.
  - [ ] 2.3 Author per-AZ route tables: one public route table with a single `0.0.0.0/0 → InternetGateway` route shared by both public subnets; two private route tables each with `0.0.0.0/0 → NatGateway<AZ>`; two data route tables with local-only routes.
  - [ ] 2.4 Author two NAT Gateways (one per AZ) with allocated EIPs; add `DependsOn: VPCGatewayAttachment` to each NAT Gateway to ensure the Internet Gateway is attached before NAT Gateways are created.
  - [ ] 2.5 Author all six `AWS::EC2::SubnetRouteTableAssociation` resources; author all Outputs and Exports (`VpcId`, `PublicSubnetAId`, `PublicSubnetBId`, `PrivateSubnetAId`, `PrivateSubnetBId`, `DataSubnetAId`, `DataSubnetBId`, `NatGatewayAId`, `NatGatewayBId`).
  - [ ]* 2.6 Run `cfn-lint --include-checks W --template infra/cloudformation/network.yaml` and confirm exit code 0 with zero warnings; run `cfn_nag_scan --input-path infra/cloudformation/network.yaml` and confirm zero FAIL findings.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R7.2, R7.3_

- [ ] 3. Security groups and IAM roles (compute.yaml — security section)
  - [ ] 3.1 Author `AlbSecurityGroup` with inbound `TCP/443` and `TCP/80` from `0.0.0.0/0`; egress `TCP/8080` to `AppSecurityGroup`; set `GroupDescription` and `Name` tag.
  - [ ] 3.2 Author `AppSecurityGroup` with inbound `TCP/8080` from `AlbSecurityGroup` using `SourceSecurityGroupId`; egress `TCP/5432` to `DbSecurityGroup` and `TCP/443` to `0.0.0.0/0`.
  - [ ] 3.3 Author `DbSecurityGroup` with inbound `TCP/5432` from `AppSecurityGroup` using `SourceSecurityGroupId`; zero outbound rules (omit `SecurityGroupEgress` entirely).
  - [ ] 3.4 Author `EcsExecutionRole` (`AWS::IAM::Role`) with trust policy for `ecs-tasks.amazonaws.com` and managed policy `AmazonECSTaskExecutionRolePolicy`; author `EcsTaskRole` with trust policy for `ecs-tasks.amazonaws.com` and an inline policy granting `secretsmanager:GetSecretValue` on the `DbSecretArn` import only.
  - [ ]* 3.5 Verify all intra-VPC security group rules use `SourceSecurityGroupId` / `DestinationSecurityGroupId`; confirm zero `CidrIp` rules on intra-VPC ingress by grepping the template: `grep -n CidrIp infra/cloudformation/compute.yaml` should return only the two ALB internet-facing lines.
  - _Requirements: R5.1, R5.2, R5.3, R5.4_

- [ ] 4. Compute stack — ALB, Target Group, ECS (compute.yaml — compute section)
  - [ ] 4.1 Author `ApplicationLoadBalancer` as internet-facing, referencing the two public subnet IDs via `!ImportValue` and `AlbSecurityGroup`; configure access log attributes with `AccessLogBucketName` parameter.
  - [ ] 4.2 Author `AppTargetGroup` with `TargetType: ip`, `Protocol: HTTP`, `Port: 8080`, health check on `/health` expecting HTTP 200, `HealthCheckIntervalSeconds: 30`, `HealthyThresholdCount: 2`, `UnhealthyThresholdCount: 3`.
  - [ ] 4.3 Author `HttpsListener` with `SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06`, forward action to `AppTargetGroup`, certificate from `CertificateArn` parameter; author `HttpRedirectListener` on port 80 with `HTTP_301` redirect to HTTPS.
  - [ ] 4.4 Author `EcsCluster` with `containerInsights: enabled`; author `AppLogGroup` (`/ecs/<StackName>/app`, `RetentionInDays: 30`); author `AppTaskDefinition` with `RequiresCompatibilities: [FARGATE]`, `NetworkMode: awsvpc`, `awslogs` log driver, and container port mapping `8080`.
  - [ ] 4.5 Author `AppService` with `DependsOn: HttpsListener`, `LaunchType: FARGATE`, `PlatformVersion: LATEST`, `AssignPublicIp: DISABLED`, circuit breaker `Enable: true, Rollback: true`, and load balancer registration on port 8080.
  - [ ] 4.6 Author Application Auto Scaling: `AWS::ApplicationAutoScaling::ScalableTarget` on the ECS service with `MinCapacity: 2` and `MaxCapacity: 10`; `AWS::ApplicationAutoScaling::ScalingPolicy` using `TargetTrackingScaling` on `ECSServiceAverageCPUUtilization` with `TargetValue: 70`.
  - [ ]* 4.7 Run `cfn-lint --include-checks W --template infra/cloudformation/compute.yaml` and confirm exit code 0; verify `AppService` resource has `DependsOn: HttpsListener` to prevent listener-less registration on creation.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R3.1, R3.2, R3.3, R3.4, R3.5_

- [ ] 5. Data stack — RDS and Secrets Manager (data.yaml)
  - [ ] 5.1 Author `DbSubnetGroup` referencing `DataSubnetAId` and `DataSubnetBId` imports from the network stack.
  - [ ] 5.2 Author `DbSecret` (`AWS::SecretsManager::Secret`) with `GenerateSecretString` generating a 32-character password excluding `/`, `@`, `"`, with template `{"username": "dbadmin"}`.
  - [ ] 5.3 Author `DbInstance` with `Engine: postgres`, `EngineVersion: 16.3`, `MultiAZ: true`, `StorageType: gp3`, `AllocatedStorage: 20`, `StorageEncrypted: true`, KMS key from `DbKmsKeyArn`, credentials resolved from `DbSecret` via `{{resolve:secretsmanager:...}}`, `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`, `DeletionProtection: true`, `EnablePerformanceInsights: true`.
  - [ ] 5.4 Author Outputs: `DbEndpointAddress` (from `!GetAtt DbInstance.Endpoint.Address`) and `DbSecretArn` (from `!Ref DbSecret`), both exported with `!Sub "${AWS::StackName}-<key>"`.
  - [ ]* 5.5 Run `cfn-lint --include-checks W --template infra/cloudformation/data.yaml`; confirm `DbKmsKeyArn` and `CertificateArn` parameters both declare `NoEcho: true`; run `cfn_nag_scan` and confirm zero FAIL findings.
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R7.3, R7.4_

- [ ] 6. CloudWatch observability
  - [ ] 6.1 Author CloudWatch Alarms in `compute.yaml`: `Alb5xxAlarm` on `HTTPCode_ELB_5XX_Count > 10` for 2 periods of 60 s; `EcsCpuAlarm` on `CPUUtilization > 85` for 3 periods of 60 s; both publish to `AlertTopicArn` via `AWS::SNS::TopicPolicy`.
  - [ ] 6.2 Author `RdsFreeStorageAlarm` in `data.yaml` on `FreeStorageSpace < 2147483648` for 1 period; publish to `AlertTopicArn`.
  - [ ] 6.3 Author `AppErrorCountFilter` (`AWS::Logs::MetricFilter`) on `/ecs/<StackName>/app` extracting `level: ERROR` to metric `AppErrorCount` in namespace `Application`; author `AppErrorAlarm` on `AppErrorCount > 5` for 2 periods of 300 s.
  - [ ] 6.4 Author `OverviewDashboard` (`AWS::CloudWatch::Dashboard`) in `compute.yaml` with JSON body containing widgets for ALB `RequestCount`, `TargetResponseTime`, `HTTPCode_ELB_5XX_Count`; ECS `CPUUtilization`, `MemoryUtilization`; RDS `DatabaseConnections`, `ReadLatency`, `WriteLatency`, `FreeStorageSpace`.
  - [ ] 6.5 Author daily drift detection: `AWS::Events::Rule` with `rate(1 day)` schedule targeting an `AWS::Lambda::Function` that calls `aws cloudformation detect-stack-drift` and publishes the result to `AlertTopicArn`.
  - _Requirements: R5.5, R6.1, R6.2, R6.3, R6.4, R6.5_

- [ ] 7. Root stack and final template wiring (root.yaml)
  - [ ] 7.1 Author three `AWS::CloudFormation::Stack` resources — `NetworkStack`, `ComputeStack`, `DataStack` — with `TemplateURL` pointing to S3 URLs; pass `NetworkStack` Outputs to `ComputeStack` and `DataStack` via `!GetAtt NetworkStack.Outputs.<Key>`; pass `ComputeStack` `AppSecurityGroupId` output to `DataStack`.
  - [ ] 7.2 Propagate all user-facing parameters (`CertificateArn`, `AppImageUri`, `TaskCpu`, `TaskMemory`, `DesiredTaskCount`, `AccessLogBucketName`, `AlertTopicArn`, `DbInstanceClass`, `DbKmsKeyArn`) from the root stack to the appropriate nested stacks; mark all sensitive parameters with `NoEcho: true`.
  - [ ]* 7.3 Run `cfn-lint --include-checks W --template infra/cloudformation/root.yaml`; run the same for all three nested templates; assert all four templates exit code 0 with zero warnings; run `cfn_nag_scan --input-path infra/cloudformation/` and assert zero FAIL findings across all templates.
  - _Requirements: R7.1, R7.2, R7.4, R7.5_

- [ ] 8. Architecture diagram (draw.io)
  - [ ] 8.1 Run `drawio-ai generate --library aws-general --output docs/architecture-diagram.drawio --prompt "AWS three-tier VPC: IGW, two public subnets with ALB and NAT Gateways, two private subnets with ECS Fargate service, two data subnets with RDS Multi-AZ PostgreSQL, security group swimlane boundaries, CloudWatch and Secrets Manager"`.
  - [ ] 8.2 Review the generated diagram; add or correct subnet CIDR labels (`10.0.0.0/24` through `10.0.21.0/24`), AZ swimlane labels (`AZ-a`, `AZ-b`), and Multi-AZ replication arrow between primary and standby RDS icons using `drawio-ai edit`.
  - [ ] 8.3 Run `drawio-ai export --format png --dpi 150 docs/architecture-diagram.drawio --output docs/architecture-diagram.png`; assert output file size is greater than 10 KB.
  - [ ]* 8.4 Run `drawio-ai validate docs/architecture-diagram.drawio --schema aws-three-tier`; assert exit code 0 confirming that Internet Gateway, ALB, ECS, RDS, NAT Gateway, and VPC component types are all present.
  - _Requirements: R8.1, R8.2, R8.5_

- [ ] 9. End-to-end sandbox deployment and smoke checks
  - [ ] 9.1 Upload nested template files to an S3 bucket in the sandbox account: `aws s3 sync infra/cloudformation/ s3://<bucket>/cfn/ --exclude "*.md"`.
  - [ ] 9.2 Deploy the root stack: `rain deploy infra/cloudformation/root.yaml --stack-name three-tier-sandbox --params CertificateArn=<arn>,AppImageUri=<ecr-uri>,...`; monitor stack events until all nested stacks reach `CREATE_COMPLETE`.
  - [ ]* 9.3 Run HTTP smoke checks: `curl -sk https://<AlbDnsName>/health` expecting HTTP 200; `curl -sI http://<AlbDnsName>/health` expecting HTTP 301 redirect to HTTPS; assert both checks pass within 2 minutes of ALB reaching active state.
  - [ ]* 9.4 Verify ECS task count and health: `aws ecs describe-services --cluster three-tier-sandbox-cluster --services three-tier-sandbox-app --query 'services[0].runningCount'` must return `2`; target group healthy host count in CloudWatch must equal `2`.
  - [ ]* 9.5 Verify drift-free state: `aws cloudformation detect-stack-drift --stack-name three-tier-sandbox`; poll until `DETECTION_COMPLETE`; assert `StackDriftStatus: NOT_DRIFTED`.
  - [ ] 9.6 Tear down sandbox stack: `rain rm three-tier-sandbox`; confirm all resources deleted except RDS instance and access log S3 bucket (both retained by `DeletionPolicy: Retain`); manually delete retained resources after confirming no data is needed.
  - _Requirements: R1.6, R2.1, R2.4, R3.3, R5.5, R7.5_

- [ ] 10. Architecture documentation
  - [ ] 10.1 Use the `architecture-doc` skill to generate `docs/solution-architecture-document.docx`: provide the architecture diagram PNG, per-tier component descriptions from `design.md`, the CloudFormation parameter reference from `infra/cloudformation/PARAMETERS.md`, and an operational runbook covering deploy (`rain deploy`), scale (auto-scaling policy tuning), and failover (RDS Multi-AZ promotion) procedures.
  - [ ] 10.2 Produce `docs/well-architected-review.md` with the six-pillar table from `design.md`; for each `PARTIAL` or `RISK` finding, expand the remediation notes into a concrete implementation task with an AWS service name, a rough effort estimate, and a priority (`HIGH`, `MEDIUM`, `LOW`).
  - [ ] 10.3 Update `docs/system-architecture.md` to add the three-tier architecture as a new section with a reference link to `docs/solution-architecture-document.docx` and the embedded diagram PNG.
  - [ ] 10.4 Produce a `docs/three-tier-architecture-deck.pptx` using the `pptx` skill with slides: title, agenda, architecture overview (embedded diagram PNG), per-tier deep-dive (3 slides), Well-Architected summary (radar or table), and next steps (top 3 remediation items from the review).
  - _Requirements: R8.3, R8.4_

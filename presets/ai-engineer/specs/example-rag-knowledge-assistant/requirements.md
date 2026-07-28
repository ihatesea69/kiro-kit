# Requirements Document

## Introduction

This document defines the requirements for an **AWS-native RAG Knowledge Assistant** that answers natural-language questions about internal documentation using Amazon Bedrock Knowledge Bases, Amazon Bedrock Guardrails, and a Strands Agents front end. Documents are ingested from Amazon S3 into a Bedrock Knowledge Base — with configurable hierarchical chunking and Amazon Titan Embeddings v2 — stored in an OpenSearch Serverless vector collection, and surfaced via the `RetrieveAndGenerate` and `Retrieve` APIs. Every input query and generated answer passes through Bedrock Guardrails before reaching the user. A **Bedrock RAG evaluation job** (`CreateEvaluationJob`) is wired as a CI quality gate enforcing per-metric thresholds; a curated golden question set and a weekly drift-monitoring job complete the evaluation lifecycle.

This specification is the AWS-native counterpart to the `data-ai` preset's `example-rag-chatbot`, which uses a framework-agnostic pipeline with a self-hosted vector database. The two specifications share the same evaluation philosophy but differ in infrastructure: this one is 100% AWS-managed with no self-hosted components.

The deliverables are **infrastructure-as-code artifacts and configuration files** — not application business logic. They include a Python CDK application (five stacks), a golden question set, Bedrock Guardrails configuration, a Step Functions evaluation state machine, an evaluation threshold manifest, and a CloudWatch drift-monitoring dashboard.

## Glossary

| Term | Definition |
|------|-----------|
| Knowledge Base | An Amazon Bedrock resource that manages the full ingestion pipeline — S3 source, chunking, embedding, and OpenSearch Serverless storage — and exposes retrieval via the `RetrieveAndGenerate` and `Retrieve` APIs. |
| Ingestion Job | A Bedrock-managed synchronisation run triggered by `StartIngestionJob` that processes new or changed S3 objects, chunks and embeds them, and updates the vector store index. |
| Chunking Strategy | The algorithm that splits raw document text into segments before embedding; configured on the Knowledge Base data source as `HIERARCHICAL`, `FIXED_SIZE`, or `SEMANTIC`. |
| Embeddings Model | The Amazon Titan Embeddings model (`amazon.titan-embed-text-v2:0`) called by Bedrock at ingestion and retrieval time to convert text chunks into 1024-dimensional dense vectors. |
| Vector Store | The managed OpenSearch Serverless (AOSS) collection that stores document chunk embeddings and serves approximate-nearest-neighbour (ANN) queries during retrieval. |
| Guardrails | An Amazon Bedrock Guardrails resource that applies topic filters, content filters, PII masking, and a grounding check to both the user query (input) and the model response (output). |
| Grounding Check | A Guardrails filter that compares a generated answer against retrieved context chunks and blocks the response when the factual grounding score falls below a configured threshold. |
| RAG Evaluation Job | A Bedrock model evaluation job (`CreateEvaluationJob`) with `evaluationConfig.ragConfig` that scores retrieved chunks and generated answers against a golden question set using the verified metric names. |
| Golden Question Set | A curated JSONL file (`evaluation/golden-questions.jsonl`) containing `question`, `expected_answer`, and optional `reference_context` for each test case; used as input to the RAG evaluation job. |
| Citation | A structured reference in the model response linking a claim to its source S3 object key and chunk text, returned in the `citations` array of the `RetrieveAndGenerate` response. |
| Strands Agents | AWS's lightweight code-first agent SDK that drives a model-driven tool loop with Bedrock as the default provider; the front end in this specification uses Strands to call `RetrieveAndGenerate` and a `retrieve` tool. |
| AgentCore Gateway | An Amazon Bedrock AgentCore component (GA October 2025) that unifies Knowledge Bases, MCP servers, Lambda functions, and internal APIs into a single tool surface; pricing $0.005 / 1,000 API invocations + $0.02 / 100 tools indexed / month. |
| Drift Monitoring | A CloudWatch alarm set and a weekly scheduled Lambda job that re-runs a fixed golden subset and alerts when quality scores degrade below steady-state baselines. |
| Threshold Manifest | A JSON file (`evaluation/thresholds.json`) that declares the minimum acceptable score for each RAG evaluation metric and is read by both the CI gate and the drift-monitoring Lambda. |

## Out of Scope

- Fine-tuning or continued pre-training of the generation model; the assistant invokes a managed Bedrock foundation model at inference time only.
- End-user authentication and authorisation for the query endpoint; API Gateway JWT authorisation is covered by a separate security specification.
- Multi-region Knowledge Base replication; this architecture targets a single AWS region (us-east-1) with availability provided by OpenSearch Serverless's multi-AZ replication.
- Conversational session memory across turns; multi-turn state via AgentCore Memory is documented as a future extension but not built in this specification.
- Custom re-ranking models beyond the Bedrock-managed default; a future ADR will evaluate Amazon Bedrock Rerank when production recall metrics fall below target.
- Document pre-processing pipelines upstream of S3 (OCR, PDF table extraction, format conversion); ingestion assumes documents are already in plain text, Markdown, or HTML format when placed in the S3 source bucket.

## Requirements

### Requirement 1: S3 Source Bucket and Bedrock Knowledge Base Provisioning

**User Story:** As a platform engineer, I want all internal documentation stored in a versioned S3 bucket connected to an Amazon Bedrock Knowledge Base, so that documents are automatically chunked, embedded, and indexed in an OpenSearch Serverless vector store without manual pipeline code.

#### Acceptance Criteria

1. WHEN the CDK stack is deployed, THE SYSTEM SHALL provision an S3 bucket (`rag-kb-docs-{env}-{account_id}`) with versioning enabled, SSE-S3 encryption, all public-access blocked, and an S3 lifecycle rule that transitions objects to S3 Infrequent Access after 90 days; the bucket ARN shall be exported as a CloudFormation output `RagDocsBucketArn`.
2. WHEN documents are placed in the S3 bucket under the `docs/` prefix, THE SYSTEM SHALL make them available for ingestion by the Bedrock Knowledge Base data source, which is configured with `dataSourceConfiguration.s3Configuration.bucketArn` and `inclusionPrefixes = ["docs/"]`.
3. WHEN a new object is created or modified in the S3 bucket, THE SYSTEM SHALL trigger `StartIngestionJob` via an S3 EventBridge notification rule targeting a Lambda function (`kb-sync-trigger`), which passes `knowledgeBaseId` and `dataSourceId` read from SSM Parameter Store paths `/rag-assistant/{env}/knowledge-base-id` and `/rag-assistant/{env}/data-source-id`.
4. WHEN a `StartIngestionJob` call fails or returns a job with `status = FAILED`, THE SYSTEM SHALL log the failure to CloudWatch Logs group `/rag-assistant/ingestion` with the data source ID and failure reason, publish a `IngestionJobFailed` count metric to namespace `RagAssistant/Ingestion`, and send a notification to the `ops-alerts` SNS topic.

---

### Requirement 2: Hierarchical Chunking and Titan Embeddings Configuration

**User Story:** As an AI engineer, I want the Knowledge Base data source to use a hierarchical chunking strategy with Amazon Titan Embeddings v2, so that retrieval recall is maximised for long-form technical documents without exceeding the embedding model's token limit.

#### Acceptance Criteria

1. WHEN the Knowledge Base data source is created, THE SYSTEM SHALL configure `chunkingConfiguration.chunkingStrategy = HIERARCHICAL` with `hierarchicalChunkingConfiguration.levelConfigurations` set to: parent chunk max tokens = 1500, child chunk max tokens = 300, child overlap tokens = 20; these values shall be CDK context parameters (`chunk_parent_tokens`, `chunk_child_tokens`, `chunk_overlap_tokens`) overridable per environment in `cdk.json`.
2. WHEN the Knowledge Base is created, THE SYSTEM SHALL configure `knowledgeBaseConfiguration.vectorKnowledgeBaseConfiguration.embeddingModelArn` to `arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0` and the OpenSearch Serverless collection with `vectorIndexName = rag-kb-index`, vector dimension = 1024, and distance metric `cosine`.
3. WHEN the Knowledge Base performs retrieval, THE SYSTEM SHALL use the child chunk for ANN scoring and return the parent chunk as the generation context window, preserving both the precision of child-level matching and the coherence of parent-level context.
4. WHEN `StartIngestionJob` completes, THE SYSTEM SHALL log the ingestion summary (`statistics.numberOfDocumentsScanned`, `statistics.numberOfDocumentsDeleted`, `statistics.numberOfDocumentsFailed`) to the `/rag-assistant/ingestion` CloudWatch Logs group and emit `DocumentsIndexed` and `DocumentsFailed` metrics to `RagAssistant/Ingestion`.

---

### Requirement 3: Bedrock Guardrails on Input and Output

**User Story:** As a compliance engineer, I want all user queries and model responses to pass through a Bedrock Guardrails policy that blocks harmful content, masks PII, and enforces topic boundaries, so that the assistant cannot be prompted into generating off-topic or harmful output.

#### Acceptance Criteria

1. WHEN a user query is submitted, THE SYSTEM SHALL call `ApplyGuardrail` on the query text before any Knowledge Base invocation; if the `action` field in the response equals `GUARDRAIL_INTERVENED`, THE SYSTEM SHALL return a structured refusal `{"answer": null, "refusal_reason": "<topic>", "citations": []}` with HTTP 400 and shall not invoke the Knowledge Base or the generation model.
2. WHEN `RetrieveAndGenerate` returns a response, THE SYSTEM SHALL check the `guardrailAction` field in the output; if the value is `INTERVENED`, THE SYSTEM SHALL replace the model response with a safe default message, record a `GuardrailOutputBlock` count metric in namespace `RagAssistant/Guardrails`, and log the blocked response text to CloudWatch Logs group `/rag-assistant/guardrails/output`.
3. WHEN the Bedrock Guardrails resource is provisioned, THE SYSTEM SHALL configure: denied topics `["competitor_products", "legal_advice", "medical_advice"]`; content filters at strength `HIGH` for `HATE`, `VIOLENCE`, and `SEXUAL`; PII masking for entity types `EMAIL`, `PHONE`, `SSN`, and `NAME`; and a grounding check with `threshold = 0.75` to detect factually ungrounded generation.
4. WHEN the grounding check blocks a response, THE SYSTEM SHALL write a structured log entry to CloudWatch Logs group `/rag-assistant/guardrails/grounding` containing the `session_id`, grounding score, retrieved context chunk URIs, and the rejected response text; the log group shall have a retention policy of 90 days.

---

### Requirement 4: Strands Agents Query Front End with Mandatory Inline Citations

**User Story:** As an AI engineer, I want a Strands Agents agent that calls the Bedrock `RetrieveAndGenerate` API and exposes a `retrieve` tool, so that end users receive answers with mandatory inline citations linking every claim to its source document and chunk.

#### Acceptance Criteria

1. WHEN a user submits a natural-language query, THE SYSTEM SHALL invoke the Strands Agents agent (`src/agent/rag_agent.py`), which calls `RetrieveAndGenerate` with `retrieveAndGenerateConfiguration.type = KNOWLEDGE_BASE`, `knowledgeBaseConfiguration.knowledgeBaseId` from environment configuration, `knowledgeBaseConfiguration.retrievalConfiguration.vectorSearchConfiguration.numberOfResults = 5`, and `generationConfiguration.guardrailConfiguration.guardrailId` set to the provisioned Guardrails resource ARN.
2. WHEN `RetrieveAndGenerate` returns a response, THE SYSTEM SHALL extract every element of the `citations` array and include each citation — `retrievedReferences[*].location.s3Location.uri` and `retrievedReferences[*].content.text` — in the API response body under the `citations` key; if the `citations` array is empty the agent SHALL reject the response, log a `ZeroCitationResponse` metric to `RagAssistant/Citations`, and return an HTTP 422 error.
3. WHEN the Strands Agents agent requires granular retrieval (for example, to fetch additional context after an initial partial answer), THE SYSTEM SHALL invoke the `retrieve` tool (`src/agent/tools/retrieve_tool.py`), which calls the Bedrock `Retrieve` API with `retrievalConfiguration.vectorSearchConfiguration.numberOfResults = 5` and returns the ranked chunks as a list of `{"uri": ..., "score": ..., "text": ...}` objects to the agent loop.
4. WHEN the agent produces a final answer, THE SYSTEM SHALL write the response envelope `{"answer": "<text>", "citations": [{"uri": "<s3_uri>", "excerpt": "<chunk_text>"}], "session_id": "<uuid>", "latency_ms": <int>}` to the DynamoDB session log table (`rag-assistant-sessions-{env}`) with `PK = SESSION#{session_id}`, `SK = QUERY#{iso_timestamp}`, and a `ttl` set to 30 days from now.

---

### Requirement 5: Bedrock RAG Evaluation CI Quality Gate

**User Story:** As an AI engineer, I want a Bedrock RAG evaluation job triggered in CI after every deployment to the staging environment, so that retrieval and generation quality metrics are scored against verified thresholds before any production promotion is allowed.

#### Acceptance Criteria

1. WHEN the CI pipeline deploys to staging, THE SYSTEM SHALL invoke `CreateEvaluationJob` with `evaluationConfig.ragConfig.knowledgeBaseConfig.type = KNOWLEDGE_BASE`, referencing the staging Knowledge Base ID, the golden question set S3 URI (`s3://rag-kb-docs-staging-{account_id}/evaluation/golden-questions.jsonl`), and judge model `amazon.nova-pro-v1:0`; the evaluation output shall be written to `s3://rag-kb-eval-output-{account_id}/ci/{job_id}/`.
2. WHEN the evaluation job completes with `status = COMPLETED`, THE SYSTEM SHALL parse the output metrics file and assert the following minimum thresholds from `evaluation/thresholds.json`: retrieval metrics `context_relevance >= 0.80`, `coverage >= 0.75`, `citation_precision >= 0.85`, `citation_coverage >= 0.80`; generation metrics `correctness >= 0.80`, `completeness >= 0.75`, `faithfulness >= 0.85`, `helpfulness >= 0.80`; if any threshold is breached THE SYSTEM SHALL fail the CI stage and print a human-readable report listing each breached metric, its actual score, and the configured threshold.
3. WHEN the evaluation job returns `status = FAILED`, THE SYSTEM SHALL publish the job ID, failure reason, and S3 output prefix to the `ops-alerts` SNS topic and fail the CI stage immediately without waiting for retry.
4. WHEN the evaluation job `status = IN_PROGRESS`, THE SYSTEM SHALL poll via a Step Functions `Wait` state every 60 seconds and enforce a maximum total evaluation timeout of 30 minutes; if the timeout is reached THE SYSTEM SHALL call `StopEvaluationJob`, publish a timeout alert to the `ops-alerts` SNS topic, and fail the CI stage.

---

### Requirement 6: Golden Question Set Authoring and Validation

**User Story:** As an AI engineer, I want a versioned golden question set validated by a schema-check Lambda before every evaluation run, so that the evaluation job always receives well-formed input and question-set quality is tracked over time.

#### Acceptance Criteria

1. WHEN the golden question set file is uploaded to the S3 bucket, THE SYSTEM SHALL invoke a validation Lambda (`kb-eval-validator`) that parses each JSONL line and asserts the presence of required fields `question` (non-empty string) and `expected_answer` (non-empty string); any malformed line shall cause the Lambda to return a failure, block the `CreateEvaluationJob` call, and log the line number and parse error to CloudWatch Logs.
2. WHEN the `kb-eval-validator` Lambda runs, THE SYSTEM SHALL count total question-answer pairs and fail validation if the count is below 25; the threshold shall be a Lambda environment variable (`MIN_GOLDEN_QUESTIONS`) so it can be raised without code changes.
3. WHEN the golden question set is uploaded to S3, THE SYSTEM SHALL preserve all prior versions via S3 object versioning, so that any CI run can be replicated by referencing the S3 object version ID stored alongside the evaluation job metadata in DynamoDB.
4. WHEN the `kb-eval-validator` Lambda completes successfully, THE SYSTEM SHALL emit a `GoldenSetRecordCount` metric (value = record count) to namespace `RagAssistant/Evaluation`, enabling dashboard trend charts of golden set growth.

---

### Requirement 7: Python CDK Infrastructure-as-Code Conventions

**User Story:** As a platform engineer, I want the entire RAG assistant infrastructure defined in a Python CDK application with separate stacks per layer, so that each environment instantiates the same constructs with environment-specific context values and no manual console changes are required.

#### Acceptance Criteria

1. WHEN `cdk synth --context env=sandbox` is run, THE SYSTEM SHALL produce a CloudFormation template set with no manual resource imports required; all resources shall be defined across five CDK stacks — `RagStorageStack`, `RagKnowledgeBaseStack`, `RagGuardrailsStack`, `RagAgentStack`, and `RagObservabilityStack` — instantiated from `infra/app.py`.
2. WHEN `cdk diff --context env=sandbox` is compared against `--context env=production`, THE SYSTEM SHALL show only context-value differences (bucket suffix, chunk token sizes, guardrail thresholds, log retention days); the resource type graph shall be identical across environments.
3. WHEN `cdk deploy` completes, THE SYSTEM SHALL tag every provisioned resource with at minimum: `Environment`, `Project = "rag-assistant"`, `ManagedBy = "cdk"`, and `Owner`; enforced via `Tags.of(app).add(...)` calls in `infra/app.py` before `app.synth()`.
4. WHEN `cdk-nag` with the `AwsSolutions` and `NIST.SP.800.53.R5` rule sets is run against the synthesised templates, THE SYSTEM SHALL pass all applicable checks including: S3 bucket versioning and encryption (`AwsSolutions-S1`, `AwsSolutions-S2`), Lambda function not publicly accessible (`AwsSolutions-L1`), DynamoDB encryption at rest (`AwsSolutions-DDB3`), and IAM no wildcard actions (`AwsSolutions-IAM4`).

---

### Requirement 8: Drift Monitoring and Observability

**User Story:** As an AI engineer, I want a CloudWatch dashboard and a weekly drift-monitoring job that re-runs a fixed golden subset and alerts when quality scores degrade, so that silent model or data drift is detected before it affects production users.

#### Acceptance Criteria

1. WHEN the CloudWatch dashboard `RagAssistantDashboard` is rendered, THE SYSTEM SHALL display: ingestion job success and failure counts over time, `DocumentsIndexed` and `DocumentsFailed` metrics, `GuardrailInputBlock` and `GuardrailOutputBlock` event rates, `ZeroCitationResponse` count, query p50 and p99 latency (`RetrieveAndGenerate` end-to-end duration), and the latest evaluation job scores for all eight required RAG metrics as single-value widgets.
2. WHEN the weekly drift-monitoring Lambda (`kb-drift-monitor`) runs on the EventBridge schedule `cron(0 6 ? * MON *)`, THE SYSTEM SHALL invoke `CreateEvaluationJob` against the fixed 10-question drift subset (`evaluation/drift-subset.jsonl`), parse the result scores, and publish a `DriftScore` metric to namespace `RagAssistant/Drift` with a `MetricName` dimension for each of the eight evaluation metrics.
3. WHEN any `DriftScore` metric falls below its threshold value (read from `evaluation/thresholds.json`) for two consecutive weekly runs, THE SYSTEM SHALL trigger a CloudWatch alarm (`RagDriftAlarm`) that publishes to the `ops-alerts` SNS topic with a notification body identifying the metric name, current score, baseline threshold, and the evaluation job ID for both failing runs.
4. WHEN the `RetrieveAndGenerate` API call duration exceeds a p99 of 10 000 milliseconds over any 5-minute window, THE SYSTEM SHALL trigger a CloudWatch alarm (`RagLatencyAlarm`) that publishes to `ops-alerts` and writes a `HighLatencyEvent` structured log entry to `/rag-assistant/latency` containing `session_id`, `knowledge_base_id`, `guardrail_id`, and `elapsed_ms`.

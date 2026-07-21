# Requirements Document

## Introduction

This document defines the requirements for a Customer Churn Prediction ML pipeline. The system ingests customer behaviour and subscription data from heterogeneous sources, engineers predictive features, trains binary classification models (churn / not-churn), registers versioned model artefacts, serves predictions through batch and real-time APIs, and monitors deployed models for data and prediction drift.

The pipeline targets a subscription-based business where early identification of at-risk customers enables proactive retention campaigns. Missing a true churner (false negative) is more costly than a false positive, so the operating threshold is tuned toward higher recall. The system must be fully reproducible: identical data and configuration must produce identical trained models.

## Glossary

| Term | Definition |
|------|-----------|
| Churn | A customer who cancels or fails to renew their subscription within a defined observation window (default: 30 days). |
| Feature Store | A centralised repository of computed, versioned feature vectors accessible to both training and inference pipelines. |
| Model Registry | A versioned catalogue of trained model artefacts, hyperparameters, evaluation metrics, and model cards (MLflow Model Registry). |
| AUC-ROC | Area Under the Receiver Operating Characteristic curve; the primary model performance metric. |
| Average Precision | Area under the Precision-Recall curve; robust to class imbalance and used as a secondary gate. |
| PSI | Population Stability Index; measures distribution shift of an input feature between training and serving traffic. |
| KL Divergence | Kullback-Leibler divergence; measures shift in the model's output score distribution over time. |
| SMOTE | Synthetic Minority Over-sampling Technique; generates synthetic churn examples to address class imbalance. |
| Model Card | A structured document capturing a model's intended use, training population, performance metrics, limitations, and fairness notes. |
| Inference Latency | Wall-clock time from receiving a prediction request to returning a scored response, measured at the p95 percentile, excluding network I/O. |
| Schema Drift | A change in column names, types, or the presence of required fields between the schema the model was trained on and new incoming data. |
| Operating Threshold | The probability cut-off (default 0.5, configurable) used to convert a continuous churn score into a binary churn / not-churn label. |

## Requirements

### Requirement 1: Data Ingestion and Schema Validation

**User Story:** As a data engineer, I want to ingest customer event and subscription data from multiple configured sources and validate every batch against a versioned schema, so that downstream pipeline stages are protected from corrupt, malformed, or structurally shifted inputs.

#### Acceptance Criteria

1. WHEN the ingestion job is triggered, THE SYSTEM SHALL load data from the sources listed in `configs/ingestion.yaml` — which may include PostgreSQL tables, S3 parquet partitions, and local CSV files — using credentials from environment variables, never from the config file.
2. WHEN data is loaded, THE SYSTEM SHALL validate each row against the canonical feature schema (column names, dtypes, nullable flags) and raise a `SchemaValidationError` with a per-column error report if more than 1 % of rows fail validation, halting the pipeline before any data is written.
3. IF a column listed as `nullable: false` in the schema is entirely absent from the incoming dataset, THEN THE SYSTEM SHALL raise a `SchemaDriftError` identifying all missing columns, log the error with the source identifier and UTC timestamp, and halt the pipeline.
4. WHEN a nullable column contains null values at a rate above its configured `null_rate_threshold`, THE SYSTEM SHALL emit a `DataQualityWarning` (without halting) and continue, imputing the column using the strategy in `configs/features.yaml`.
5. WHEN ingestion completes successfully, THE SYSTEM SHALL write a data manifest to `data/manifests/{date}_{source}.json` containing row count, source path or table name, SHA-256 checksum of the raw output file, schema version string, and ingestion UTC timestamp.
6. WHERE `configs/ingestion.yaml` sets `mode: incremental` for a source, THE SYSTEM SHALL load only records with an `event_date` value strictly greater than the watermark stored in `data/watermarks/{source_name}.json`, and overwrite the watermark file with the maximum `event_date` of the loaded batch upon successful completion.
7. WHILE the ingestion job is running, THE SYSTEM SHALL log a progress line to stdout every 10 000 rows processed, including the running count and elapsed time, so that an orchestrator can detect a stalled job before the configured timeout fires.

---

### Requirement 2: Feature Engineering Pipeline

**User Story:** As a data scientist, I want a reproducible, versioned feature engineering pipeline that computes RFM signals, session behavioural aggregates, support-ticket features, and encoded categoricals, so that the exact same transformations are applied during training and at inference and can be audited for any deployed model version.

#### Acceptance Criteria

1. WHEN the feature pipeline is executed, THE SYSTEM SHALL compute the following feature groups from validated raw data: (a) RFM features (recency in days, login frequency, total spend) over a configurable look-back window defaulting to 90 days; (b) session and page-view counts aggregated over the last 7 and 30 days; (c) support-ticket count and days-since-last-contact over 90 days; (d) contract tenure in days; (e) one-hot-encoded plan tier (`free`, `starter`, `pro`, `enterprise`) with a catch-all `unknown` bucket for values not seen during training.
2. WHEN a feature value is missing because a customer has no recorded events in the look-back window, THE SYSTEM SHALL impute the value using the median computed from the training set (not the current batch), and set a corresponding boolean `{feature_name}_imputed` column to `True` in the output feature matrix.
3. IF a categorical feature at inference time contains a value absent from the encoder's training vocabulary, THEN THE SYSTEM SHALL silently assign the `unknown` bucket, increment the `unknown_category_count` counter in the monitoring store, and continue rather than raising an exception, so that no valid prediction request is rejected due to an unseen category.
4. WHEN the pipeline is run for training, THE SYSTEM SHALL serialise all fitted transformers — `SimpleImputer` medians, `StandardScaler` parameters, and `OneHotEncoder` vocabulary — together with the feature schema version into `models/feature_pipeline_v{version}.pkl` using `joblib.dump`, so that the identical transformer is loaded at inference.
5. WHEN the feature pipeline completes, THE SYSTEM SHALL write the output feature matrix to `data/features/churn_features_{date}_{split}.parquet` with the schema version string embedded in the parquet file's custom metadata, enabling downstream validation that the correct pipeline version was used.
6. WHERE a feature's computed value falls outside three standard deviations of its training-set distribution, THE SYSTEM SHALL clip the value to the boundary (−3σ or +3σ), emit an `OutlierClipWarning` log entry keyed by feature name and customer ID, and continue processing.
7. WHILE computing features for more than 100 000 customers in a single call, THE SYSTEM SHALL process the data in chunks of at most 50 000 rows to keep peak memory usage below 4 GB on a standard training instance, yielding each chunk's result before loading the next.

---

### Requirement 3: Model Training, Class Imbalance Handling, and Experiment Tracking

**User Story:** As a data scientist, I want to train a churn classifier with built-in class imbalance handling and automatic experiment tracking in MLflow, so that every training run is fully reproducible, comparable across runs, and traceable back to its exact data and configuration.

#### Acceptance Criteria

1. WHEN a training run is initiated, THE SYSTEM SHALL resolve all hyperparameters, the model type, the random seed, the data manifest path, and the imbalance strategy exclusively from `configs/training.yaml`, log the complete resolved configuration as MLflow parameters before the first training step, and refuse to start if any required config key is absent.
2. WHEN the training dataset's positive-class (churn) rate is below 10 %, THE SYSTEM SHALL apply the imbalance strategy specified in the config — either `scale_pos_weight` (XGBoost), `class_weight="balanced"` (scikit-learn estimators), or SMOTE oversampling applied only to training folds — and log the chosen strategy name and resulting per-class sample counts to MLflow.
3. WHEN training completes, THE SYSTEM SHALL log to the active MLflow run: AUC-ROC, Average Precision, F1 score, Precision, and Recall at the configured operating threshold, Brier Score, a calibration curve PNG, and the confusion matrix, all computed on the held-out validation set.
4. IF the AUC-ROC on the validation set is below 0.70, THEN THE SYSTEM SHALL set the MLflow run tag `status=FAILED`, log the reason string `model_performance_threshold_not_met`, and exit without registering the model or writing any artefact to the model registry.
5. WHERE `configs/training.yaml` sets `cv_strategy: time_series`, THE SYSTEM SHALL use `sklearn.model_selection.TimeSeriesSplit` with `n_splits=5` to prevent look-ahead leakage, report the mean and standard deviation of AUC-ROC across folds as MLflow metrics, and use the mean AUC-ROC as the gate value for Requirement 3.4.
6. WHEN training uses any stochastic element (PyTorch MLP, random forest, SMOTE), THE SYSTEM SHALL set `torch.manual_seed`, `numpy.random.seed`, `random.seed`, and the estimator's `random_state` parameter all to the value of `training.random_seed`, record the seed in MLflow, and produce identical model weights on a second run with the same data and config on the same hardware.
7. WHILE training is running, THE SYSTEM SHALL emit a heartbeat log line to stdout every 60 seconds containing the elapsed time and the current training loss or fold index, so that the orchestrator can detect a hung job before the configured `training.timeout_minutes` is reached.

---

### Requirement 4: Model Evaluation, Registration, and Versioning

**User Story:** As an ML engineer, I want trained models evaluated on a held-out test set and registered to the MLflow Model Registry with structured metadata and a model card, so that only models meeting performance gates can reach production and any deployed version can be inspected or rolled back.

#### Acceptance Criteria

1. WHEN a training run passes the AUC-ROC gate (>= 0.70 on the validation set), THE SYSTEM SHALL evaluate the final model on the chronologically held-out test set and compute AUC-ROC, Average Precision, F1, Precision, and Recall at operating thresholds 0.3, 0.5, and 0.7, plus a Brier Score and Platt-scaled calibration curve, logging all as MLflow artefacts.
2. WHEN evaluation completes on the test set, THE SYSTEM SHALL register the model in MLflow Model Registry under the name `churn_prediction` with the following metadata stored as MLflow tags: run ID, training data manifest checksum, feature pipeline version, a hash of the resolved hyperparameter dict, and all evaluation metric values, alongside a model card JSON file (see Data Models in the design document).
3. IF a new model candidate's test-set AUC-ROC is lower than the currently `Production`-staged model's registered AUC-ROC by more than 0.01, THEN THE SYSTEM SHALL block promotion to `Production`, log the comparison as `challenger_did_not_beat_champion` with both AUC-ROC values, and leave the existing `Production` model unchanged.
4. WHEN a model is promoted to `Production` stage in the registry, THE SYSTEM SHALL atomically transition the previous `Production` model to `Archived` stage, and append a promotion event record — containing the new version number, the approver identity read from the `KIRO_ML_APPROVER` environment variable, and the UTC timestamp — to `models/promotion_log.jsonl`.
5. WHERE model registration is invoked with the `--dry-run` flag, THE SYSTEM SHALL validate all required metadata fields for completeness, verify that the MLflow registry connection is reachable, and print a validation report without writing any artefact or changing any model stage.
6. WHEN the MLflow registry is unreachable during model registration, THE SYSTEM SHALL retry the operation three times with exponential backoff delays of 1 s, 2 s, and 4 s, and raise a `RegistryConnectionError` after the third failure, logging the endpoint URL and each retry attempt.

---

### Requirement 5: Batch and Real-Time Inference

**User Story:** As a product engineer, I want churn scores delivered through a nightly batch job for CRM campaign targeting and through a low-latency REST endpoint for live in-product retention triggers, so that the retention team can act on churn risk both proactively and in real time without maintaining two separate systems.

#### Acceptance Criteria

1. WHEN the batch inference job is executed, THE SYSTEM SHALL load the `Production` model and the corresponding `FeaturePipeline` from the registry, compute features for all active customers (those with a subscription event in the last 90 days), and write a scored parquet file to `data/predictions/churn_scores_{date}.parquet` containing columns `customer_id`, `churn_probability` (float32), `churn_binary` (bool), `model_version` (string), and `scored_at` (UTC ISO-8601 timestamp).
2. WHEN a `POST /v1/predict` request is received with a valid JSON body containing `customer_id` and a `features` dict, THE SYSTEM SHALL return HTTP 200 with a JSON body containing `customer_id`, `churn_probability`, `churn_binary`, `model_version`, `latency_ms`, and an `imputed_features` list, with p95 inference latency under 100 ms measured at the application layer.
3. IF one or more feature keys are missing or null in a real-time prediction request, THEN THE SYSTEM SHALL apply median imputation for numeric fields and the `unknown` bucket for categorical fields using values from the loaded `FeaturePipeline`, populate the `imputed_features` list in the response with the feature name, imputation strategy, and original (null) value, and return a valid HTTP 200 prediction rather than a 4xx error.
4. WHEN a `POST /v1/predict/batch` request is received with a list of up to 1 000 customer payloads, THE SYSTEM SHALL return predictions for all customers in a single HTTP 200 response within 500 ms at p95, achieved by constructing a `pandas.DataFrame` from all request records and calling `model.predict_proba()` once on the entire batch rather than scoring row by row.
5. IF the `Production` model is not present in the MLflow registry when the inference service starts up, THEN THE SYSTEM SHALL return HTTP 503 from `GET /health/ready` until a valid model and `FeaturePipeline` are successfully loaded, preventing the service from being added to the load balancer's healthy-host pool.
6. WHERE the inference API is deployed behind a load balancer, THE SYSTEM SHALL expose `GET /health/live` returning HTTP 200 whenever the process is running (liveness), and `GET /health/ready` returning HTTP 200 only after the model and feature pipeline are loaded and the first warm-up prediction has completed successfully (readiness).
7. WHEN a batch inference job finds that no `Production` model exists in the registry, THE SYSTEM SHALL exit with a non-zero return code, write an error entry to `data/predictions/errors_{date}.json`, and send a `BATCH_SCORING_FAILED` alert to the configured webhook.

---

### Requirement 6: Monitoring, Drift Detection, and Alerting

**User Story:** As an ML engineer, I want automated nightly monitoring that detects input feature distribution drift, prediction score drift, and realised model performance degradation, so that I can trigger retraining before stale churn scores harm retention campaigns.

#### Acceptance Criteria

1. WHEN the daily monitoring job runs, THE SYSTEM SHALL compute the Population Stability Index (PSI) for each numerical feature between the reference distribution (stored at training time in `models/reference_stats_v{version}.json`) and the distribution of the same features observed in the last 7 days of serving traffic, classifying any feature with PSI > 0.2 as `high_drift` and PSI 0.1–0.2 as `moderate_drift`.
2. WHEN the daily monitoring job runs, THE SYSTEM SHALL compute the KL divergence between the training-time prediction score distribution and the distribution of live prediction scores from the last 7 days, and trigger a `PREDICTION_DRIFT_ALERT` if KL divergence exceeds 0.1.
3. IF ground-truth churn labels become available in the CRM system (joined 30 days after the scoring date), THEN THE SYSTEM SHALL compute realised AUC-ROC and Average Precision on the labelled cohort and trigger a `MODEL_DEGRADATION_ALERT` if realised AUC-ROC falls more than 0.05 below the AUC-ROC recorded in the model's registry metadata.
4. WHEN any monitored threshold is breached — PSI > 0.2, KL divergence > 0.1, or realised AUC-ROC drop > 0.05 — THE SYSTEM SHALL publish an alert to the webhook URL stored in the `KIRO_ALERT_WEBHOOK_URL` environment variable, including the metric name, current value, threshold, affected feature names (for PSI alerts), the active model version, and the monitoring run ID.
5. WHERE the monitoring job detects that fewer than 100 unique customers were scored in the last 24 hours, THE SYSTEM SHALL emit a `LOW_PREDICTION_VOLUME_ALERT` and skip PSI and KL divergence computation for that day, because the sample size is insufficient to produce reliable distribution estimates.
6. WHEN the monitoring job completes, THE SYSTEM SHALL write a monitoring report to `reports/monitoring_{date}.json` containing all computed PSI values per feature, the KL divergence value, the realised performance metrics (if labels are available), the drift verdict for each check, and the alert dispatch status, enabling dashboard ingestion and historical audit.
7. WHILE computing drift metrics, THE SYSTEM SHALL load feature reference distributions exclusively from `models/reference_stats_v{version}.json` — a file written at training time containing per-feature mean, standard deviation, percentiles (5th, 25th, 50th, 75th, 95th), and value counts for categorical columns — so that monitoring does not require access to the original training dataset.

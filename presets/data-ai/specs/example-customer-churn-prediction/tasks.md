# Implementation Plan: Customer Churn Prediction

## Overview

This plan builds the Customer Churn Prediction pipeline in strict dependency order, from project scaffolding through data infrastructure, model development, inference service, and monitoring. Each task produces a tested, reviewable artefact before the next task begins. Sub-tasks marked `- [ ]*` are test tasks that should run in CI on every pull request. Estimated effort: 10–12 engineer-days for a single ML engineer.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Project scaffold and dependency pinning
  - [ ] 1.1 Initialise the Python package at `src/churn/__init__.py` with `py.typed` marker and a `pyproject.toml` pinning: `scikit-learn>=1.4`, `xgboost>=2.0`, `torch>=2.2`, `mlflow>=2.12`, `great-expectations>=0.18`, `fastapi>=0.111`, `uvicorn>=0.29`, `imbalanced-learn>=0.12`, `optuna>=3.6`, `pandas>=2.2`, `pyarrow>=15`, `pydantic>=2.7`, `joblib>=1.4`, `httpx>=0.27`.
  - [ ] 1.2 Create skeleton config files `configs/ingestion.yaml`, `configs/features.yaml`, `configs/training.yaml`, `configs/evaluation.yaml`, and `configs/monitoring.yaml` with all keys documented via inline comments; define default values matching the requirements (look-back window 90 d, AUC-ROC gate 0.70, PSI threshold 0.2, etc.).
  - [ ] 1.3 Create a `Makefile` with targets `ingest`, `train`, `evaluate`, `serve`, `monitor`, and `test`, each invoking the corresponding `python -m churn.<module>` entry point with `--config configs/<module>.yaml`.
  - [ ] 1.4 Write `docker/Dockerfile.train` (Python 3.11 + CUDA base, all training deps) and `docker/Dockerfile.serve` (slim Python 3.11, runtime deps only, non-root user, port 8080 exposed).
  - [ ] 1.5 Configure MLflow tracking: add `MLFLOW_TRACKING_URI` to `.env.example` and document local (`file:./mlruns`) and remote (PostgreSQL + S3 artefact store) options in `docs/mlflow-setup.md`.
  - _Requirements: R3.1, R3.6_

- [ ] 2. Feature schema and API data models
  - [ ] 2.1 Implement `src/churn/schema.py` with `SCHEMA_VERSION = "1"`, the `FEATURE_SCHEMA` dict (dtypes, nullable flags, value ranges, and categorical value lists exactly as specified in the Design document), and derived sets `FEATURE_COLUMNS`, `NULLABLE_COLUMNS`, `CATEGORICAL_COLUMNS`, `REQUIRED_COLUMNS`.
  - [ ] 2.2 Implement `src/churn/api_models.py` with Pydantic v2 models: `PredictRequest`, `FeatureImputationMeta`, `PredictResponse`, `BatchPredictRequest` (max 1 000 items enforced by `Field(max_length=1000)`), and `BatchPredictResponse`.
  - [ ] 2.3 Add a `src/churn/exceptions.py` module defining `SchemaValidationError`, `SchemaDriftError`, `OutlierClipWarning`, `RegistryConnectionError`, and `ModelNotFoundError` as typed exception classes with structured `detail` attributes.
  - [ ]* 2.4 Write `tests/unit/test_schema.py`: assert `FEATURE_COLUMNS` does not include `churned_30d`; assert all `nullable=False` columns appear in `REQUIRED_COLUMNS`; assert `BatchPredictRequest` raises `ValidationError` for a list of 1 001 items; assert `PredictResponse.churn_probability` is validated in [0, 1].
  - _Requirements: R1.2, R2.1, R5.2, R5.3, R5.4_

- [ ] 3. Data ingestion layer
  - [ ] 3.1 Implement `src/churn/data_ingestion.py` with a `DataIngestionConfig` dataclass loaded from `configs/ingestion.yaml` and an `ingest(config)` function supporting three source types via a reader plugin pattern: `PostgresReader`, `S3ParquetReader`, and `CsvReader`, each reading connection details from environment variables.
  - [ ] 3.2 Implement row-level schema validation inside `ingest()`: count rows that fail dtype or range checks, raise `SchemaValidationError` with a per-column error report when the invalid rate exceeds `config.max_invalid_row_pct` (default 0.01), and raise `SchemaDriftError` with the list of missing column names when any `REQUIRED_COLUMN` is absent.
  - [ ] 3.3 Implement `DataQualityWarning` emission when a nullable column's null rate exceeds its configured threshold; log the column name, null count, and threshold.
  - [ ] 3.4 Implement incremental load: read the watermark from `data/watermarks/{source_name}.json` (default to epoch 0 if absent), filter `event_date > watermark`, write the updated watermark on success.
  - [ ] 3.5 Write the data manifest to `data/manifests/{date}_{source_name}.json` on successful ingestion (row count, source path, SHA-256 checksum of the output parquet, schema version, ingestion UTC timestamp); log progress to stdout every 10 000 rows.
  - [ ]* 3.6 Write `tests/unit/test_ingestion.py` using `unittest.mock`: mock `PostgresReader.read()` to return a DataFrame with one invalid row (1.5 % of 67 rows) and assert `SchemaValidationError` is raised; mock a DataFrame missing `contract_tenure_days` and assert `SchemaDriftError`; assert manifest JSON is written on success; assert watermark file is updated after incremental load.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7_

- [ ] 4. Feature engineering pipeline
  - [ ] 4.1 Implement `src/churn/feature_pipeline.py` with a `FeaturePipeline` class that exposes `fit(df_train: pd.DataFrame) -> None` and `transform(df: pd.DataFrame) -> pd.DataFrame`; compute the five feature groups specified in R2.1: RFM over the look-back window from `configs/features.yaml`, session aggregates at 7 d and 30 d, support-ticket signals, contract tenure, and one-hot plan tier with `unknown` bucket.
  - [ ] 4.2 Integrate `sklearn.impute.SimpleImputer(strategy="median")` fitted only on training data; at transform time apply median imputation to all null values in nullable numeric columns and set the corresponding `{feature_name}_imputed` boolean column to `True`.
  - [ ] 4.3 Implement outlier clipping at ±3σ (bounds computed at `fit()` time from the training set); emit an `OutlierClipWarning` log entry per (feature, customer_id) pair when a value is clipped; do not halt.
  - [ ] 4.4 Implement the `unknown` bucket for categorical columns: if a value at transform time is not in the encoder vocabulary built during `fit()`, assign it to `"unknown"` and increment `self._unknown_category_count[column]`.
  - [ ] 4.5 Implement `transform_chunked(df, chunk_size=50_000)` as a generator that yields processed chunks; use it automatically when `len(df) > 100_000` in the `transform()` method to cap peak memory at 4 GB.
  - [ ] 4.6 Serialise the fitted `FeaturePipeline` with `joblib.dump` to `models/feature_pipeline_v{version}.pkl`, embedding `schema_version` as an instance attribute; write the output feature matrix to `data/features/churn_features_{date}_{split}.parquet` with the schema version in parquet custom metadata.
  - [ ]* 4.7 Write `tests/unit/test_feature_pipeline.py`: assert RFM computation on a 10-row fixture matches manually computed values; assert `session_count_7d_imputed` is `True` for a row with null `session_count_7d`; assert a value at 4σ is clipped to 3σ boundary; assert plan tier `"enterprise_plus"` maps to `"unknown"`; assert `transform_chunked` on a 120 000-row DataFrame produces the same result as single-pass `transform`.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7_

- [ ] 5. Training pipeline with class imbalance handling and experiment tracking
  - [ ] 5.1 Implement `src/churn/train.py` with a `TrainingConfig` dataclass loaded from `configs/training.yaml` and a `train(config) -> mlflow.ActiveRun` function supporting model types `xgboost`, `logistic_regression`, and `pytorch_mlp`, selected via `config.model_type`.
  - [ ] 5.2 Before the first training step, resolve the complete config dict (all keys, all defaults applied) and call `mlflow.log_params(resolved_config)` plus `mlflow.log_param("data_manifest_checksum", manifest.checksum)`.
  - [ ] 5.3 Detect the positive-class rate in the training split; if below 0.10, apply the imbalance strategy from `config.imbalance_strategy`: set `scale_pos_weight = n_neg / n_pos` for XGBoost, `class_weight="balanced"` for LogReg, or run `SMOTE(k_neighbors=5)` on the training fold only when `smote` is selected; log strategy name and resulting per-class counts to MLflow.
  - [ ] 5.4 Set all random seeds before model instantiation: `random.seed(config.random_seed)`, `numpy.random.seed(config.random_seed)`, `torch.manual_seed(config.random_seed)`, and pass `random_state=config.random_seed` to every scikit-learn estimator.
  - [ ] 5.5 Start a background daemon thread that logs a heartbeat line to stdout every 60 seconds during training, including elapsed time and the current fold index or epoch number; join the thread before returning.
  - [ ] 5.6 Compute reference feature statistics (per-feature mean, std, percentiles 5/25/50/75/95, categorical value counts) from the training split and write them to `models/reference_stats_v{schema_version}.json` for use by the monitoring job.
  - [ ]* 5.7 Write `tests/unit/test_train.py`: mock MLflow; assert `log_params` called with `random_seed`; construct a DataFrame with 5 % positive rate and assert `scale_pos_weight` > 1 is set on the XGBoost model; assert `mlflow.set_tag("status", "FAILED")` is called when a mocked `evaluate()` returns AUC-ROC = 0.69; assert heartbeat thread joins without error on a 0-epoch training stub.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.6, R3.7_

- [ ] 6. Model evaluation and registry registration
  - [ ] 6.1 Implement `src/churn/evaluate.py` with an `evaluate(model, X_val, y_val, X_test, y_test, config) -> dict` function computing AUC-ROC, Average Precision, F1, Precision, Recall at thresholds [0.3, 0.5, 0.7], Brier Score, and Platt-scaled calibration; apply `CalibratedClassifierCV(method="sigmoid", cv=5)` post-training; log all metrics and a calibration curve PNG to the active MLflow run.
  - [ ] 6.2 Enforce the validation-set AUC-ROC gate: if `val_auc_roc < config.auc_roc_min` (default 0.70), call `mlflow.set_tag("status", "FAILED")`, log reason `model_performance_threshold_not_met`, and raise `ModelPerformanceError` to stop the pipeline before any artefact is written to the registry.
  - [ ] 6.3 Implement `src/churn/register.py` with `register_model(run_id, model, feature_pipeline, config) -> str` that calls `mlflow.sklearn.log_model()`, calls `mlflow.register_model()`, sets all MLflow tags defined in the model card schema, writes `models/model_card_{version}.json`, and returns the registered model version string.
  - [ ] 6.4 Implement champion/challenger guard: before promotion, fetch the `Production` model's `test_auc_roc` tag from the registry; if the challenger's test AUC-ROC is < champion AUC-ROC − 0.01, raise `ChampionRetainedError` with both values logged; otherwise proceed with promotion.
  - [ ] 6.5 On successful promotion, set the previous `Production` version to `Archived` using `MlflowClient.transition_model_version_stage()` and append a promotion event record to `models/promotion_log.jsonl` (new version, champion AUC-ROC, challenger AUC-ROC, approver from `KIRO_ML_APPROVER` env var, UTC timestamp).
  - [ ] 6.6 Wrap the `mlflow.register_model()` call with retry logic: attempt up to 3 times with delays of 1 s, 2 s, 4 s on `mlflow.exceptions.MlflowException`; after the third failure raise `RegistryConnectionError`.
  - [ ] 6.7 Add a `--dry-run` CLI flag to `python -m churn.register`: validate all model card fields for completeness, check registry connectivity with a lightweight `MlflowClient.search_registered_models()` call, and print a validation report without writing any artefact.
  - [ ]* 6.8 Write `tests/unit/test_evaluate.py` and `tests/unit/test_register.py`: assert `ModelPerformanceError` at AUC-ROC = 0.69; assert Brier Score on a perfectly calibrated toy distribution equals the expected value; assert `RegistryConnectionError` raised after exactly 3 mock failures; assert model card JSON contains all required top-level keys; assert `--dry-run` makes no write calls.
  - _Requirements: R3.3, R3.4, R3.5, R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [ ] 7. Batch inference pipeline
  - [ ] 7.1 Implement `src/churn/batch_score.py` with a `batch_score(config) -> Path` function that loads the `Production` model and `FeaturePipeline` from the MLflow registry, queries all active customers (subscription event in last 90 days) in chunks of 50 000, and writes a scored parquet to `data/predictions/churn_scores_{date}.parquet`.
  - [ ] 7.2 Ensure the output parquet contains exactly these columns: `customer_id` (string), `churn_probability` (float32), `churn_binary` (bool, `churn_probability >= config.operating_threshold`), `model_version` (string), `scored_at` (UTC ISO-8601 timestamp); assert no nulls in any column.
  - [ ] 7.3 Exit with return code 1 and write an error record to `data/predictions/errors_{date}.json` if the `Production` model is not found; call `send_alert("BATCH_SCORING_FAILED", ...)` before exiting.
  - [ ]* 7.4 Write `tests/integration/test_batch_score.py`: register a fixture model in a temporary MLflow instance; run `batch_score()` against a 200-row fixture DataFrame; assert output parquet exists at the expected path; assert no nulls in `churn_probability`; assert `model_version` matches the registered version string.
  - _Requirements: R5.1, R5.5, R5.7_

- [ ] 8. Real-time inference API
  - [ ] 8.1 Implement `src/churn/inference_api.py` as a FastAPI app with an `asynccontextmanager` lifespan hook that (a) loads the `FeaturePipeline` from `models/feature_pipeline_v{version}.pkl`, (b) loads the `Production` model from the MLflow registry, (c) runs a synthetic warm-up prediction, and (d) sets `app.state.model_loaded = True`.
  - [ ] 8.2 Implement `GET /health/live` returning HTTP 200 immediately, and `GET /health/ready` returning HTTP 200 when `app.state.model_loaded is True`, else HTTP 503 with body `{"status": "loading"}`.
  - [ ] 8.3 Implement `POST /v1/predict`: parse `PredictRequest`, apply missing-feature imputation (median for numerics, `unknown` for categoricals) using the loaded `FeaturePipeline`, score with `model.predict_proba()`, measure `latency_ms` from request receipt, and return a `PredictResponse`.
  - [ ] 8.4 Implement `POST /v1/predict/batch`: FastAPI validates `BatchPredictRequest.requests` length <= 1 000 via Pydantic, returning HTTP 422 automatically for oversized payloads; construct a `pd.DataFrame.from_records()` of all feature dicts, apply imputation, call `model.predict_proba()` once on the full batch, zip results into `BatchPredictResponse`.
  - [ ] 8.5 Implement structured-JSON request logging middleware: after each prediction, append one JSON line to a rotating log file `logs/predictions_{date}.jsonl` containing `customer_id`, `model_version`, `churn_probability`, `latency_ms`, and `imputed_feature_count` (length of `imputed_features` list).
  - [ ] 8.6 Implement `GET /v1/model/info`: return a JSON body with `model_version`, `feature_pipeline_version`, `schema_version`, and `model_card.intended_use` from the loaded artefacts.
  - [ ]* 8.7 Write `tests/integration/test_api.py` using `httpx.AsyncClient` with `transport=ASGITransport(app=app)`: assert `/health/ready` is 503 before lifespan completes; POST `/v1/predict` with `session_count_7d=null` and assert `imputed_features` contains `{"feature": "session_count_7d", "strategy": "median"}`; POST `/v1/predict/batch` with 1 001 items and assert HTTP 422; assert `latency_ms` is a positive float.
  - _Requirements: R5.2, R5.3, R5.4, R5.5, R5.6, R5.7_

- [ ] 9. Monitoring and drift detection
  - [ ] 9.1 Implement `src/churn/monitor.py` with a `MonitoringJob` class that loads `models/reference_stats_v{version}.json`, reads the last 7 days of prediction logs from `logs/predictions_*.jsonl`, joins serving feature values from the feature store, and computes PSI for each numerical feature.
  - [ ] 9.2 Implement PSI computation: bin numerical features into 10 equal-width buckets defined by the reference distribution's min/max; compute per-category fractions for categoricals; classify each feature as `stable`, `moderate_drift` (PSI 0.1–0.2), or `high_drift` (PSI > 0.2).
  - [ ] 9.3 Implement KL divergence computation on the prediction score distribution: bin serving scores into 20 equal-width buckets; add Laplace smoothing (epsilon = 1e-8) to avoid log(0); trigger `PREDICTION_DRIFT_ALERT` when KL > 0.1.
  - [ ] 9.4 Implement the low-volume guard: if fewer than 100 unique `customer_id` values appear in prediction logs for the last 24 hours, emit `LOW_PREDICTION_VOLUME_ALERT` and skip PSI and KL computation entirely for the current monitoring run.
  - [ ] 9.5 Implement realised performance monitoring: join `data/predictions/churn_scores_{scoring_date}.parquet` to CRM ground-truth labels (path from `configs/monitoring.yaml`); compute realised AUC-ROC and Average Precision; trigger `MODEL_DEGRADATION_ALERT` and call `trigger_retraining()` when realised AUC-ROC < registered AUC-ROC − 0.05.
  - [ ] 9.6 Implement `src/churn/alerting.py` with `send_alert(alert_type, metric, current_value, threshold, model_version, monitoring_run_id, affected_features)` posting the alert payload JSON to the URL in `KIRO_ALERT_WEBHOOK_URL` via `httpx.post()` with a 5-second timeout.
  - [ ] 9.7 Write the monitoring report to `reports/monitoring_{date}.json` on every run, containing all PSI values, KL divergence value, realised metrics (or `null` if labels unavailable), drift verdicts, alert dispatch status, and monitoring run ID.
  - [ ]* 9.8 Write `tests/unit/test_monitor.py`: construct two numpy arrays with known PSI = 0.25 and assert alert fires; construct identical arrays and assert no alert; construct a prediction log with 50 rows and assert `LOW_PREDICTION_VOLUME_ALERT` without PSI/KL computation; compute realised AUC-ROC = 0.74 against a registered value of 0.83 and assert `MODEL_DEGRADATION_ALERT`; mock `httpx.post` and assert alert payload contains all required keys.
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7_

- [ ] 10. Orchestration, end-to-end validation, and CI
  - [ ] 10.1 Implement `pipelines/churn_pipeline.py` as a Prefect 2 flow wiring tasks 3–9 in dependency order: `ingest` → `validate` (Great Expectations suite) → `feature_eng` → `train` → `evaluate` → `register` → `batch_score` → `monitor`; configure `retries=2` and `retry_delay_seconds=30` on each task; send a `PIPELINE_FAILED` webhook alert via `alerting.send_alert()` in the flow's `on_failure` hook.
  - [ ] 10.2 Run the full pipeline end-to-end on the 500-row fixture dataset against a temporary MLflow tracking server (`mlflow server --backend-store-uri sqlite:///test.db`); assert a model is registered in the `Production` stage and the output parquet exists.
  - [ ] 10.3 Write model tests `tests/model/test_model_invariance.py`: load the fixture-trained model; assert identical prediction for two requests differing only in `customer_id`; assert that incrementing `days_since_last_login` from 0 to 365 in steps of 30 produces a monotonically non-decreasing `churn_probability` (all other features held constant).
  - [ ] 10.4 Write `tests/model/test_calibration.py` and `tests/model/test_class_imbalance_recall.py`: assert Brier Score <= 0.12 on the validation fixture; assert minority-class recall >= 0.60 at threshold 0.3 on a synthetically constructed 5 % positive-rate fixture.
  - [ ] 10.5 Run load test against the inference API using `locust` (`locustfiles/churn_api.py`): 50 concurrent users, 120-second ramp-up; assert p95 latency < 100 ms for `POST /v1/predict` and < 500 ms for `POST /v1/predict/batch`; record results to `reports/load_test_{date}.html`.
  - [ ] 10.6 Add `.github/workflows/churn_ci.yml` with jobs: `lint` (`ruff check src/ tests/`), `type-check` (`mypy src/churn/`), `unit-tests` (`pytest tests/unit/ -v --cov=src/churn --cov-fail-under=80`), `integration-tests` (`pytest tests/integration/ -v`); block merge if any job fails.
  - _Requirements: R1.5, R3.5, R3.6, R4.1, R5.2, R5.4, R6.6_

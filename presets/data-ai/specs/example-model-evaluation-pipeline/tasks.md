# Implementation Plan: Model Evaluation Pipeline

## Overview

This plan builds the Model Evaluation Pipeline in strict dependency order: project scaffolding and schema definitions, the golden dataset store, the evaluator registry, offline evaluation with CI gate logic, online evaluation with drift detection and divergence alerting, closed-loop feedback, and reporting. Each task produces a tested, reviewable artefact before the next begins. Sub-tasks marked `- [ ]*` are test tasks that must run in CI on every pull request. Estimated effort: 8–10 engineer-days for a single ML engineer.

Requirement references use the format `RN.M` (Requirement N, Acceptance Criterion M).

## Tasks

- [ ] 1. Project scaffold and dependency pinning
  - [ ] 1.1 Initialise the Python package at `src/eval/__init__.py` with a `py.typed` marker and a `pyproject.toml` pinning: `scikit-learn>=1.4`, `pydantic>=2.7`, `pandas>=2.2`, `numpy>=1.26`, `httpx>=0.27`, `jinja2>=3.1`, `prefect>=2.16`, `pyarrow>=15`, `jsonschema>=4.22`, `pytest>=8.2`, `pytest-cov>=5.0`, `ruff>=0.4`.
  - [ ] 1.2 Create skeleton config files `configs/eval_config.yaml` (evaluators list, metric gates with name/threshold/direction/required, regression deltas, timeout), `configs/online_eval.yaml` (sample size, label store DSN, divergence thresholds, anomaly gap, max review items), and `configs/golden_schema.json` (JSON Schema for `input` and `ground_truth`), with inline comments for every key.
  - [ ] 1.3 Create a `Makefile` with targets: `eval-offline`, `eval-online`, `eval-promote`, `eval-slice`, `test`, and `report`, each invoking the corresponding `python -m eval.<module>` entry point.
  - [ ] 1.4 Create directory structure `data/golden/`, `data/review_queue/`, `results/offline/`, `results/online/`, `logs/`, `reports/offline/`, and `templates/` with `.gitkeep` files.
  - _Requirements: R2.1, R3.1, R7.4_

- [ ] 2. Schema definitions and golden dataset models
  - [ ] 2.1 Implement `eval/schemas.py` with Pydantic v2 models: `GoldenExample`, `DatasetMeta`, `EvaluatorScore`, `ExampleResult`, `MetricGateResult`, `LatencyPercentiles`, `AggregateMetrics`, `PSIResult`, `OnlineSummary`; implement `RegressionAlert` and `DivergenceAlert` as frozen dataclasses with `asdict()` support for JSON serialisation.
  - [ ] 2.2 Implement `eval/exceptions.py` with typed exception classes: `DatasetIntegrityError`, `DatasetSizeWarning`, `DuplicateExampleWarning`, `ModelLoadError`, `UnknownEvaluatorError`, `MAPEZeroGroundTruthWarning`, `DegenerateClassWarning`, `LowLabelCoverageWarning`, `RegressionAlertError`, `EvalTimeoutError`; each carries a structured `detail` dict.
  - [ ]* 2.3 Write `tests/unit/test_schemas.py`: assert `ExampleResult` rejects a null `example_id` (Pydantic validation); assert `AggregateMetrics.gate_passed` is `False` when any `MetricGateResult.passed` is `False`; assert `EvaluatorScore` allows `score=null` with an `error` string.
  - _Requirements: R1.1, R2.1, R4.1, R5.2_

- [ ] 3. Golden dataset store
  - [ ] 3.1 Implement `eval/datasets.py` with `add(dataset_name, record_json, dry_run=False) -> GoldenExample`: validate against `configs/golden_schema.json` using `jsonschema`, compute `input_hash = sha256(json.dumps(input, sort_keys=True))`, check for duplicates by scanning `{dataset_name}.jsonl`, assign `example_id = max_id + 1`, append to the JSONL file, recompute and update `{dataset_name}.meta.json`.
  - [ ] 3.2 Implement `load(dataset_name) -> list[GoldenExample]` that reads all shard files listed in `{dataset_name}.meta.json`, calls `verify_checksum()`, and raises `DatasetIntegrityError` on mismatch; emit `DatasetSizeWarning` when `example_count < 50`.
  - [ ] 3.3 Implement `verify_checksum(dataset_name)`: compute SHA-256 of the `.jsonl` file in 64 KB streaming chunks and compare to `meta.json`; raise `DatasetIntegrityError` with the dataset name, expected hash, and actual hash on mismatch.
  - [ ] 3.4 Implement `promote_queue(dataset_name, approved_by) -> PromotionReport`: scan `data/review_queue/` for all JSONL files; for each item with `status: "confirmed_failure"`, validate and call `add()`; mark as `promoted: true`; skip `status: "rejected"` items (mark as `archived: true`); return `PromotionReport` with counters.
  - [ ]* 3.5 Write `tests/unit/test_datasets.py`: assert `add()` appends with correct monotonically increasing `example_id`; assert `verify_checksum` raises `DatasetIntegrityError` on a tampered file; assert duplicate `input_hash` skipped with `DuplicateExampleWarning`; assert `--dry-run` writes nothing; assert `promote_queue` marks `rejected` items as `archived` and skips them.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R6.1, R6.2, R6.3, R6.5_

- [ ] 4. Evaluator registry and built-in metrics
  - [ ] 4.1 Implement `eval/metrics.py` with `EVALUATOR_REGISTRY: dict[str, Callable]` and a `@register_evaluator(name: str)` class decorator; validate that each registered function accepts `(y_true: np.ndarray, y_pred: np.ndarray, **kwargs)` and returns a `float`.
  - [ ] 4.2 Implement and register the classification evaluators: `accuracy` (`sklearn.metrics.accuracy_score`), `precision`, `recall`, `f1` (at configurable `threshold`, default 0.5), `auc_roc` (`roc_auc_score`), `avg_precision` (`average_precision_score`); include the `DegenerateClassWarning` guard when all labels are one class.
  - [ ] 4.3 Implement and register the regression evaluators: `mae` (`mean_absolute_error`), `rmse` (`mean_squared_error` with `squared=False`), `mape` (manual loop skipping zero ground-truth rows, emitting `MAPEZeroGroundTruthWarning` with the skip count), `r2` (`r2_score`).
  - [ ] 4.4 Implement and register the ranking evaluators: `ndcg_at_5`, `ndcg_at_10` (using `sklearn.metrics.ndcg_score`), `map_at_10` (custom implementation using average precision over top-10 ranked items), `mrr` (custom mean reciprocal rank implementation).
  - [ ] 4.5 Implement `resolve_evaluators(names: list[str]) -> dict[str, Callable]` that looks up all names in `EVALUATOR_REGISTRY` and raises `UnknownEvaluatorError` listing all missing names if any are not found.
  - [ ]* 4.6 Write `tests/unit/test_metrics.py`: assert `auc_roc` matches `sklearn.metrics.roc_auc_score` on a 200-row fixture; assert `DegenerateClassWarning` on all-positive input; assert `UnknownEvaluatorError` raised on `["accuracy", "bogus_metric"]`; assert MAPE skips zero-ground-truth rows; assert `ndcg_at_10` on a perfect ranking returns 1.0.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6_

- [ ] 5. Offline evaluator with CI gate and regression alerting
  - [ ] 5.1 Implement `eval/offline_eval.py` with `run_offline_eval(model_uri, dataset_name, champion_uri=None, config_path="configs/eval_config.yaml") -> AggregateMetrics`: load model from `model_uri` using `mlflow.pyfunc.load_model()`; call `resolve_evaluators()`; iterate over golden examples, call `model.predict()` per example, record latency, write `ExampleResult` to JSONL; compute aggregate metrics and gate results.
  - [ ] 5.2 Implement the CI gate check: after aggregation, compare each `MetricGateResult.value` to its threshold using `direction`; write `summary.json` with `gate_passed` and structured gate results; exit with return code 1 on any required gate failure, printing the failure summary to stderr.
  - [ ] 5.3 Implement regression comparison: load `results/offline/champion_metrics.json`; for each metric, compute `delta = champion_value − challenger_value`; if `delta > config.regression_delta[metric_name]`, construct a `RegressionAlert` and call `send_alert()`; exit 1 after posting.
  - [ ] 5.4 Implement `champion_metrics.json` atomic update: on a fully passing run (gate and regression both passed), write to a temp file then `os.replace()` to `results/offline/champion_metrics.json` — ensuring no partial write is ever observed by concurrent CI runs.
  - [ ] 5.5 Add stdout progress logging every 100 examples including `evaluated_N_of_M`, elapsed seconds, and running mean of the primary metric defined in config; implement the `eval.timeout_seconds` watchdog using `signal.alarm` (POSIX) or a `threading.Timer` that raises `EvalTimeoutError`.
  - [ ]* 5.6 Write `tests/unit/test_offline_eval.py`: assert gate passes at accuracy 0.85 with gate 0.80; assert exit code 1 at accuracy 0.78; assert `RegressionAlert` raised when challenger drops 0.03 with delta threshold 0.01; assert `champion_metrics.json` is NOT updated on gate failure; assert progress log written at 100-example intervals on a 250-example fixture.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7, R7.1, R7.4, R7.5_

- [ ] 6. HTML report rendering
  - [ ] 6.1 Implement `eval/report.py` with `render_html_report(run_id, metrics: AggregateMetrics, template_dir="templates") -> Path` using Jinja2; the template (`templates/eval_report.html`) must embed: an aggregate metric table with per-metric gate status (green/red), a regression comparison section (shown when champion data is present), a histogram SVG of per-example `latency_ms` bucketed into 20 equal bins, and a sortable table of the 20 worst-scoring examples with their `input` and per-evaluator scores.
  - [ ] 6.2 Implement `alerting.py`'s `send_alert(alert) -> Literal["posted", "logged"]`: POST the alert `asdict()` as JSON to `KIRO_ALERT_WEBHOOK_URL` with a 10-second timeout using `httpx`; on failure retry once after 3 seconds; on second failure write to `logs/alerts.jsonl` and return `"logged"`; if env var is absent, skip POST entirely and write to fallback log.
  - [ ]* 6.3 Write `tests/unit/test_report.py`: assert rendered HTML file exists and contains the string "Gate Status"; assert a failing metric row contains `class="fail"`; assert 20 worst examples appear in descending score order; assert `latency_ms` histogram section is present.
  - [ ]* 6.4 Write `tests/unit/test_alerting.py`: mock `httpx.post` returning 200 and assert payload contains all required keys; mock 500 response and assert retry fires once then fallback written to `logs/alerts.jsonl`; assert fallback is used directly when `KIRO_ALERT_WEBHOOK_URL` is absent.
  - _Requirements: R7.1, R7.2, R7.3_

- [ ] 7. Drift detection module
  - [ ] 7.1 Implement `eval/drift.py` with `compute_psi(reference: np.ndarray, serving: np.ndarray, bins: int = 10) -> PSIResult`: bin `reference` into equal-width buckets using its own min/max; compute bin frequencies for both arrays; apply Laplace smoothing (eps = 1e-8) before the log ratio; sum `PSI = Σ (pserving − pref) × ln(pserving / pref)`; classify as `stable` (PSI < 0.1), `moderate_drift` (0.1 ≤ PSI ≤ 0.2), or `high_drift` (PSI > 0.2).
  - [ ] 7.2 Implement `load_reference_stats(path: str) -> dict[str, dict]` that reads `models/reference_stats.json` (written by the training pipeline) and returns a per-feature dict with `mean`, `std`, `min`, `max`, and `percentiles`.
  - [ ]* 7.3 Write `tests/unit/test_drift.py`: assert PSI = 0 on two identical uniform samples; construct a bimodal vs. uniform pair with known PSI ≈ 0.31 and assert `verdict == "high_drift"`; assert `compute_psi` handles a constant reference array (all-same-bin) via Laplace smoothing without division by zero; assert `load_reference_stats` raises `FileNotFoundError` on missing path.
  - _Requirements: R5.3_

- [ ] 8. Online evaluator with divergence detection and review queue
  - [ ] 8.1 Implement `eval/online_eval.py` with `run_online_eval(config: OnlineEvalConfig) -> OnlineSummary`: glob `logs/predictions_*.jsonl` for the past 24 hours (filter by `evaluated_at` field); stratified sample up to `config.online_sample_size` by `model_output` decile using `pd.DataFrame.groupby(...).sample()`; join ground-truth labels from the configured label store using `prediction_id` as the join key.
  - [ ] 8.2 Apply the full evaluator suite to labelled examples; write per-example `ExampleResult` records to `results/online/{run_id}/example_results.jsonl` with `labelled: false` for unmatched examples; compute online aggregate metrics.
  - [ ] 8.3 Compute divergence: for each metric in `config.divergence_thresholds`, compare `|online_value − offline_value|` (loaded from `champion_metrics.json`) to the threshold; call `send_alert(DivergenceAlert(...))` for each breach.
  - [ ] 8.4 Run PSI for each feature listed in `config.monitored_features` using `load_reference_stats()`; set `OnlineSummary.drift_detected = True` if any feature is `high_drift`; include drifted feature names in the `DivergenceAlert` when divergence and drift co-occur.
  - [ ] 8.5 Implement the review queue writer: for examples in the online sample where the primary metric score is in the bottom 5th percentile of offline example scores AND the model's confidence gap is below `config.anomaly_confidence_gap`, append to `data/review_queue/{run_id}.jsonl`; stop appending after `config.max_review_items_per_run` items and log the drop count.
  - [ ]* 8.6 Write `tests/unit/test_online_eval.py`: inject 500 prediction log entries with 70 % label match; assert `label_fraction ≈ 0.70`; inject feature values producing PSI = 0.31 and assert `drift_detected: true`; assert `LowLabelCoverageWarning` when label fraction drops to 25 %; assert review queue JSONL created with correct `prediction_id`.
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6_

- [ ] 9. Closed-loop feedback and champion refresh
  - [ ] 9.1 Implement the `promote-queue` flow in `eval/datasets.py` (per Task 3.4) and wire the post-promotion champion refresh: after `promote_queue()` adds at least one example, call `run_offline_eval(model_uri=champion_uri_from_meta, dataset_name=dataset_name)` and overwrite `champion_metrics.json` with the refreshed metrics.
  - [ ] 9.2 Implement `results slice` and `results compare` CLI subcommands in `eval/results.py`: `slice` uses `ast.literal_eval` and a field-path resolver to evaluate filter expressions without `eval()`; `compare` joins two JSONL files on `example_id` and produces the delta report.
  - [ ]* 9.3 Write `tests/integration/test_feedback_loop.py`: write 4 review queue items (3 `confirmed_failure`, 1 `rejected`); run `promote-queue`; assert golden dataset grows by 3; assert rejected item is `archived: true`; assert `champion_metrics.json` is refreshed; assert promotion report counts are correct.
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R4.2, R4.3_

- [ ] 10. End-to-end verification
  - [ ] 10.1 Write `tests/integration/test_offline_e2e.py`: create a 200-example golden dataset using `add()` with a `configs/golden_schema.json` that matches a binary classification `input` shape; register a `sklearn.dummy.DummyClassifier` as an MLflow pyfunc model in a temp tracking server; run `run_offline_eval(model_uri=..., dataset_name=..., champion_uri=None)`; assert `example_results.jsonl` has exactly 200 lines; assert `aggregate_metrics.json` contains `accuracy`, `auc_roc`, and `latency.p50_ms`; assert HTML report renders without Jinja2 error.
  - [ ] 10.2 Write `tests/integration/test_online_e2e.py`: generate 500 synthetic prediction log entries with an 80 % label match rate; run `run_online_eval()`; assert `label_fraction ≈ 0.80`; inject one feature with `high_drift` PSI; assert `DivergenceAlert` written to `logs/alerts.jsonl` (no webhook in test); assert `results/online/{run_id}/summary.json` contains all required keys.
  - [ ] 10.3 Run the full offline → online → promote-queue → champion-refresh sequence on a 100-example fixture using `pytest` and a temporary working directory; assert the final `champion_metrics.json` has a larger `example_count` than the initial version.
  - [ ] 10.4 Add `.github/workflows/eval_ci.yml` with jobs: `lint` (`ruff check src/eval/ tests/`), `type-check` (`mypy src/eval/`), `unit-tests` (`pytest tests/unit/ -v --cov=src/eval --cov-fail-under=85`), `integration-tests` (`pytest tests/integration/ -v`); block merge if any job fails.
  - _Requirements: R2.1, R2.2, R2.3, R4.1, R5.1, R5.2, R6.4, R7.4, R7.5_

- [ ] 11. Update documentation
  - [ ] 11.1 Update `docs/eval-pipeline.md` with: a quickstart showing how to add a golden example, run offline eval in CI, read the HTML report, and promote a review queue item; an evaluator registration guide (how to add a custom evaluator with `@register_evaluator`); a config reference for `eval_config.yaml` and `online_eval.yaml`; a troubleshooting section covering `DatasetIntegrityError`, webhook fallback, and degenerate class handling.
  - [ ] 11.2 Update `docs/system-architecture.md` to add the evaluation pipeline as a component with its connections to the training pipeline, the inference service (prediction logs), and the label store.
  - _Requirements: R1.1, R2.1, R3.1, R4.1, R5.1, R6.1, R7.1_

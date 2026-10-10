# 07 – Evaluation and fairness

Guidance for the steps after data preparation (report chapters 5 and 6). The dataset is prepared so that
all of this can be computed from `deadlift3_attempts.parquet` alone.

## Metrics (report 5.1)

| | Metric | Why |
|---|---|---|
| Primary | **Recall** of `dl3_failed = 1` | a missed failure (false negative) costs total and placing |
| Primary | **Precision** of `dl3_failed = 1` | false alarms make coaches too conservative |
| Secondary (guardrail) | **PR-AUC** (average precision) over all thresholds | threshold-free, suited to the class balance |
| Context only | accuracy, ROC-AUC | accuracy is misleading at ~39 % positives |

Threshold: chosen on **validation** as the threshold with recall ≥ 0.70 and the highest precision
(report 5.1 placeholder; record the final target in the decision log). Report precision and recall at that
threshold on test.

Class balance (2026-10-10): 38.7 % of 3rd attempts fail – imbalanced but not extreme. Do not resample the
validation or test sets.

## Baselines (report Table 3)

| Baseline | Definition | Fitted on |
|---|---|---|
| B1 majority class | always "succeeds" → recall 0 by definition | – |
| B2 rule of thumb | "fails if `dl3_jump_pct` > x %", x chosen on validation like the model threshold | x on validation |
| B3 (recommended extra) | "fails if the 2nd attempt failed" (`dl2_success = 0`) | – |

Data note: in the training data the failure rate is **not** monotonic in the jump (≈46 % at 0–2.5 % after a
good 2nd attempt, ≈33 % at 5–15 %), while a failed 2nd attempt raises it to ≈50–65 %. Expect B2 to be weak and
B3 to be a strong simple competitor; a model has to beat both to be worth using.

## Fairness and segment checks (report 6.2, Table 4)

Compute precision, recall and the number of test cases per segment **at the global threshold**:

| Segment column | Values | Note |
|---|---|---|
| `sex` | M, F, Mx | Mx has 61 train and 36 test rows (6 failures) on 2026-10-10 → report as "not meaningful" |
| `age_class_group` | Sub-Junior, Junior, Open, Masters, Unknown | Sub-Juniors and Masters are smaller groups |
| `equipment` | Raw, Wraps, Single-ply, Multi-ply, Unlimited | Multi-ply / Unlimited are < 1 % of rows |

Rules:

* Segments with fewer than 100 positive test cases: show the numbers, mark them as unreliable, add a
  bootstrap confidence interval if you interpret them.
* Flag a segment when its recall deviates by more than 10 percentage points from the overall recall.
* `sex` is used only here – never as an input (spec 05).

## Monitoring after deployment (report 6.4)

Per season, from logged app usage (spec 08) and new OPL data: failure rate, distribution of jumps,
precision and recall by sex and age group. Retrain and recalibrate when recall drops by more than
10 pp, or when rules or equipment trends change (concept drift). `meet_year` and `federation` support
these analyses.

## Current results (validation, model `monotone-logreg-v1`, snapshot 2026-10-10)

From `notebooks/02_model_training.ipynb`; test results in the next section (decision D-18).

| Approach | Precision | Recall | PR-AUC |
|---|---:|---:|---:|
| B1 always succeeds | – | 0.00 | 0.39 |
| B2 fails if jump ≥ x % (no cut-off reaches recall 0.70; x = 0 warns on every attempt) | 0.39 | 1.00 | 0.34 |
| B3 fails if 2nd attempt failed | 0.62 | 0.18 | 0.43 |
| Logistic regression, unconstrained | 0.49 | 0.70 | 0.56 |
| **Logistic regression, monotone in weight (app model)** | **0.48** | **0.70** | **0.55** |

Threshold 0.354 (highest precision with recall ≥ 0.70). Calibration: predicted and observed failure rates agree
within ~1 point in every decile (17 % … 66 %). The jump alone ranks *worse* than chance (PR-AUC 0.34 < 0.39) –
the selection effect of decision D-12.

Segments at the threshold: precision is similar everywhere (0.46–0.55), but **recall differs** – men 0.79 vs
women 0.49 (women's 3rd attempts fail less often: 34 % vs 41 %), Sub-Juniors 0.59, Masters 0.61, Single-ply 0.84,
Multi-ply 0.91. Mx (16 validation rows) and Unlimited are too small to judge. With equal precision and different
base rates, equal recall would need group-specific thresholds; discuss this trade-off in report 6.2 rather than
silently adding `sex` back as a threshold input.

## Final test evaluation (run once, decision D-17)

1. Freeze: the committed `app/model/model.json` is the model (monotone logistic regression fitted on train) with its
   validation threshold 0.3541 (0.35 in the report). Do not change features, model or threshold afterwards.
2. Use the data snapshot the model was trained on (`opl_commit` in the model card) and the exported `split` column –
   no re-split, no refit on validation or test.
3. Set `EVALUATE_TEST = True` in notebook 02 and run it. Section 6 refuses to run for any other model, then prints
   precision, recall and PR-AUC on test, the baselines B1–B3 (Table 3) and the segment table (Table 4).
4. The date of the run (`metrics.test.evaluated_utc`) is the date for the report. Report the numbers as they are,
   also if they are worse than on validation.

## Test results (frozen model `monotone-logreg-v1`, evaluated once on 2026-10-10, decision D-18)

131,953 attempts of 51,308 test athletes, 38.7 % failed; threshold 0.3541 and baseline cut-offs from validation.

| Approach | Precision | Recall | PR-AUC |
|---|---:|---:|---:|
| B1 always succeeds | – | 0.00 | 0.39 |
| B2 fails if jump ≥ 0 % (warns on every attempt) | 0.39 | 1.00 | 0.35 |
| B3 fails if 2nd attempt failed | 0.61 | 0.18 | 0.43 |
| **Logistic regression, monotone in weight (app model)** | **0.48** | **0.70** | **0.55** |

Test agrees with validation within 0.01 everywhere. Segments: men recall 0.79 vs women 0.49 (precision 0.48 / 0.48),
Sub-Juniors 0.60, Masters 0.61, Single-ply 0.86, Multi-ply 0.90; Mx (36 rows, 6 failures) and Unlimited too small.
Full table: `app/model/model.json` → `segments_test`.

## Reporting checklist

- [ ] Data numbers from `metadata.json` (`summary`, `splits`) in report 3.1 and Table 2
- [ ] Threshold chosen on validation, documented
- [x] Baselines B1, B2 (and B3) on test in Table 3
- [x] Segment table on test in Table 4, small segments marked
- [x] Test set used once; date and configuration noted (D-18)

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

## Reporting checklist

- [ ] Data numbers from `metadata.json` (`summary`, `splits`) in report 3.1 and Table 2
- [ ] Threshold chosen on validation, documented
- [ ] Baselines B1, B2 (and B3) on test in Table 3
- [ ] Segment table on test in Table 4, small segments marked
- [ ] Test set used once; date and configuration noted

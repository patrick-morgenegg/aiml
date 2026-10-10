---
name: leakage-check
description: Review whether a column, feature, input field or data-processing step leaks information about the 3rd deadlift attempt or about test athletes. Use before adding any feature or model input, before adding an input field to the app, when a split or preprocessing step is written or changed, and when model metrics look suspiciously good.
---

# Leakage check

The decision point is **right after the 2nd deadlift attempt**, when the coach declares the 3rd
(`docs/specs/01-project-overview.md`). Full rules: `docs/specs/05-features-and-leakage.md`, split rules:
`docs/specs/06-validation-split.md`.

## A. Checking a feature or input field

Answer each question explicitly and write the answers into your reply:

1. **When is the value known?** Name the moment (registration, weigh-in, after squat, after bench, after DL1,
   after DL2). Later than "after DL2" → reject.
2. **Is it derived from the outcome?** Anything computed from `Deadlift3Kg`'s sign, `Best3DeadliftKg`,
   `TotalKg`, `Place`, Dots / Wilks / Glossbrenner / Goodlift or `Deadlift4Kg` → reject.
3. **Does it use the future?** Values from later meets of the athlete, or statistics computed over the whole
   dataset including validation/test rows (e.g. a federation's mean failure rate over all splits) → reject or
   recompute on train only.
4. **Is it an identifier or a proxy?** Names, meet names, `athlete_id`, `record_id`, exact date + federation
   combinations, high-cardinality text → reject (memorisation, privacy).
5. **Is it `sex` or a close proxy?** → reject as an input; allowed in fairness tables only.
6. **Can the coach supply it in the app at that moment?** If not, the model can't use it in production → reject.

Verdict: *accept as candidate*, *accept after change* (say which), or *reject* (say why). An accepted new
column follows the "Changing the contract" steps of the `dataset-contract` skill and gets a
`docs/decisions.md` entry.

## B. Checking a processing step

- Split is by `athlete_id` and taken from the exported `split` column – no row-wise `train_test_split`.
- Imputers, scalers, encoders, target encodings, winsorization limits and rule-of-thumb thresholds are fitted
  on train only (and inside CV folds when cross-validating).
- The classification threshold is chosen on validation, not test.
- No deduplication, filtering or resampling uses the label in a way that differs between splits.
- History features look only at strictly earlier dates (same-day entries excluded).

## C. Red flags in results

Investigate before reporting if any of these appear:

- Recall and precision for "fails" both above ~0.9, or PR-AUC far above the B3 baseline
  ("fails if the 2nd attempt failed").
- One feature dominates importance and is not `dl2_success`, the jump or a weight.
- Validation and test metrics differ a lot (test reused or split broken), or train ≫ validation (overfitting).

Quick checks:

```python
assert df.groupby("athlete_id")["split"].nunique().max() == 1
forbidden = set(json.load(open("docs/specs/dataset_schema.json"))["forbidden_columns"])
assert not forbidden & set(feature_columns)
assert "sex" not in feature_columns and "athlete_id" not in feature_columns
```

# 06 – Validation split

## Terminology (fixed for the whole project)

The lecture notes sometimes swap the two terms; in this project they mean:

| Term | Purpose | Touched |
|---|---|---|
| **train** | fit model parameters; compute any statistic used later (scalers, encoders, rule-of-thumb threshold, input ranges) | freely |
| **validation** | compare models, tune hyper-parameters, choose the classification threshold | freely, but never for fitting |
| **test** | final, unbiased estimate of generalisation | **exactly once**, after all choices are frozen |

## Group split by athlete (report 4.1)

Most athletes compete several times. A row-wise random split would let a model learn an athlete's typical
jumps and strength in training and recognise them in the test set → optimistic metrics (leakage). Therefore
every athlete belongs to exactly one subset.

```
athlete_id (16 hex) ── first 8 hex ──► u = int(hex, 16) / 16^8   ∈ [0, 1)
u < 0.70 → train      0.70 ≤ u < 0.85 → validation      u ≥ 0.85 → test
```

* `athlete_id` is a salted SHA-256, so `u` is uniform: the split is a random draw of athletes.
* It is **deterministic and stable**: an athlete keeps its subset when the data is refreshed with newer meets,
  so a refreshed test set never contains athletes the old model trained on. New athletes are assigned by the
  same formula.
* It depends on the salt (spec 03): changing `OPL_ID_SALT` reshuffles everything.
* The split column is exported (`split`); consumers must use it rather than re-splitting.

## Result (snapshot 2026-10-10)

| Subset | Criterion | Athletes | Records | Failure rate |
|---|---|---:|---:|---:|
| train | 70 % of athlete ids | 240,340 (70.1 %) | 616,069 | 38.8 % |
| validation | 15 % of athlete ids | 51,399 (15.0 %) | 131,443 | 38.6 % |
| test | 15 % of athlete ids | 51,308 (15.0 %) | 131,953 | 38.7 % |

Up-to-date numbers: `metadata.json` → `splits`.

## Rules for downstream code

1. Never fit anything (model, scaler, imputer, encoder, rule threshold, target encoding) on validation or test.
2. Never use `athlete_id` as a feature or to build per-athlete statistics across splits.
3. Cross-validation inside train must also be grouped (`sklearn.model_selection.GroupKFold(groups=athlete_id)`).
4. Evaluate on test once; record the date and the frozen configuration in the report. If the test set has
   been used for a decision, it is no longer a test set – say so in the report.

## Optional: time-based check (report 7.3)

To study drift, additionally evaluate a model trained on `meet_year ≤ 2022` (train athletes) on
`meet_year ≥ 2024` (test athletes). Keep the athlete grouping; the time cut is applied on top of it.

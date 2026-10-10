# 08 – App integration (coach-facing decision support)

Requirements for the application built on top of the cleaned dataset. Any stack is fine as long as the
contracts below hold. **Recommended default:** Python + Streamlit + scikit-learn – it reads Parquet natively
and shares the language of the notebook. A JavaScript front end can use the CSV and a model exported
to JSON (e.g. logistic-regression coefficients).

## 1. Users and job

| User | Job in the app |
|---|---|
| Coach | after the 2nd deadlift: enter the situation, compare candidate weights for the 3rd attempt, decide |
| Athlete | sees the same view together with the coach |
| Project team | sees model card, metrics, fairness table; reviews the decision log |

The app **supports** the decision. It never declares a weight, never auto-selects one, and never hides
the uncertainty.

## 2. Data access rules

1. Read only `data/processed/*` and `data/sample/*`; never the raw zip.
2. Development, tests and demos run on `data/sample/deadlift3_attempts_sample.csv` (in git). Training uses the
   full Parquet (regenerate with the `refresh-dataset` skill if missing).
3. Use the exported `split`; never re-split, never fit on validation/test (spec 06).
4. Take feature lists and allowed values from `dataset_schema.json` and `metadata.json`, not from literals.
5. Read ids as strings (spec 04).
6. Check `schema_version` major on startup; refuse to run on an unknown major version.

## 3. Prediction contract

### Input – `AttemptContext`

| Field | Type | Required | Validation |
|---|---|---|---|
| `dl2_weight_kg` | number (kg) | yes | schema bounds (20–500) |
| `dl2_success` | boolean | yes | |
| `bodyweight_kg` | number (kg) | yes | 20–300 |
| `age_class_group` | enum | yes | `metadata.category_levels.age_class_group` (`Unknown` allowed) |
| `equipment` | enum | yes | `metadata.category_levels.equipment` |
| `best_squat_kg` | number (kg) | yes | 10–600 |
| `best_bench_kg` | number (kg) | yes | 5–400 |
| `candidate_dl3_weights_kg` | number[] (1–10 values) | yes | each `≥ dl2_weight_kg`, `> dl2_weight_kg` if `dl2_success`, jump ≤ 25 % |
| `dl1_weight_kg`, `dl1_success`, `prev_best_deadlift_kg` | optional | no | only if the model uses them |

There is **no `sex` field** – not even optional (spec 05).

Values outside the train p01–p99 range (`metadata.feature_ranges_train`) are accepted with a visible
"unusual input – prediction less reliable" note; values outside the schema bounds are rejected with a message.
The UI proposes candidates in 2.5 kg steps from DL2 (+2.5 … +10 %), editable by the coach.

### Output – one `AttemptRisk` per candidate

```json
{
  "dl3_weight_kg": 230.0,
  "dl3_jump_pct": 4.55,
  "p_fail": 0.41,
  "warning": true,
  "uncertain": true,
  "threshold": 0.38,
  "model_version": "logreg-2026-10-12",
  "dataset_snapshot": "2026-10-10"
}
```

* `dl3_jump_pct` is computed by the app from the weights – never entered.
* `warning = p_fail ≥ threshold`; the threshold comes from the model card (chosen on validation, spec 07).
* `uncertain = |p_fail − threshold| < 0.05` (configurable `UNCERTAINTY_BAND`). Shown as
  "uncertain – rely on warm-ups, bar speed and day form" (report 6.3).
* Same input + same model → same output (no randomness at inference).

### Model artifact

`models/<model_version>/` contains the model file and `model_card.json`:
`model_version`, `created_utc`, `features` (ordered), `threshold`, `uncertainty_band`,
`metrics.validation` and `metrics.test` (precision, recall, PR-AUC), `baselines` (B1–B3 on test),
`segments` (Table 4 rows), `dataset.snapshot_date`, `dataset.opl_commit`, `dataset.schema_version`.
The app reads everything it displays about the model from this file.

## 4. Screens

| Screen | Must show | Must not |
|---|---|---|
| **Attempt planner** (start page) | input form; table of candidates with weight, jump %, `p_fail` as a percentage, warning badge (icon + text, not colour alone), "uncertain" tag; a sentence that the coach decides | recommend or pre-select "the" weight; show more than one decimal of probability |
| **Decision log** | per decision: timestamp, context, candidates and risks, chosen weight, *override* flag (a warned weight was chosen), actual outcome (good / failed, entered afterwards) | ask for or store names; free text without a "no names" hint |
| **Model & data** | model card numbers, baselines, threshold, data snapshot, limitations (spec 01, report 7), OpenPowerlifting attribution | test metrics computed live on the test set |
| **Fairness** | segment table (precision, recall, n) from the model card; small segments marked unreliable | per-athlete data |
| **Explore** (optional) | aggregated charts, e.g. failure rate by jump bin and 2nd-attempt outcome, train split | cells with fewer than 20 rows; lists of athletes or meets |

## 5. Human in the loop and logging (report 6.3, 6.4)

* The coach can always choose any weight; choosing a warned weight records `override = true`, never blocks.
* The decision log is stored locally (CSV or SQLite under `app_data/`, git-ignored) and is exportable as CSV.
  It contains no personal identifiers.
* The log is the feedback source for monitoring and retraining (spec 07, "Monitoring").

## 6. Privacy and ethics (report 6.5)

* No names, no meet names, no athlete or record ids in the UI.
* No search, filter or drill-down that isolates one athlete.
* `sex` appears only in the fairness table.
* Show the OpenPowerlifting attribution on the *Model & data* screen.

## 7. Acceptance criteria

- [ ] Starts with only the repository content (sample CSV), without the full dataset.
- [ ] Rejects out-of-bounds inputs with a clear message; flags unusual inputs.
- [ ] Candidate weights below DL2 (or equal after a good DL2) cannot be evaluated.
- [ ] Every candidate shows `p_fail`, warning and uncertain state; warnings are readable without colour.
- [ ] No input or output field for sex; no names or ids anywhere in the UI.
- [ ] Model card and data snapshot visible; OPL attribution present.
- [ ] Overrides and outcomes are logged without personal data.
- [ ] Automated tests cover input validation and the prediction contract on the sample CSV;
      CI runs `python scripts/validate_dataset.py data/sample/deadlift3_attempts_sample.csv`.

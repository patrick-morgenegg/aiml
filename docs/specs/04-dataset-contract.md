# 04 – Dataset contract: `deadlift3_attempts`

This is the interface between data preparation and everything downstream (model, evaluation, app).
The machine-readable version is [`dataset_schema.json`](dataset_schema.json); `scripts/validate_dataset.py`
checks a file against it. If this page and the JSON disagree, the JSON wins – fix the page.

## Files

| Path | Format | Rows | In git |
|---|---|---|---|
| `data/processed/deadlift3_attempts.parquet` | Parquet (pyarrow), typed, categories preserved | all (879,465 on 2026-10-10) | no – regenerate |
| `data/processed/deadlift3_attempts.csv` | UTF-8, comma, header, ISO dates `YYYY-MM-DD`, empty = missing | all | no – regenerate |
| `data/processed/metadata.json` | JSON | – | yes |
| `data/sample/deadlift3_attempts_sample.csv` | as the CSV | 5,000 random rows (seed 42) | yes |

Use the **sample** for app development, unit tests and demos; use the full Parquet for training and
evaluation. Rows are sorted by `meet_date`, then `record_id`.

## Columns

Roles: `id`, `split`, `label`, `decision_input`, `feature`, `candidate_feature`, `segment_only`, `metadata`
(defined in `dataset_schema.json` → `roles`).

| Column | Type | Unit | Role | Null | Meaning |
|---|---|---|---|---|---|
| `record_id` | string (16 hex) | | id | no | unique, stable row id |
| `athlete_id` | string (16 hex) | | id | no | pseudonymous athlete, group key of the split |
| `split` | `train` \| `validation` \| `test` | | split | no | athlete-level split (spec 06) |
| `meet_date` | date | | metadata | no | meet start date |
| `meet_year` | int | | metadata | no | year of `meet_date` |
| `federation` | string | | metadata | no | hosting federation (e.g. `USAPL`) |
| `meet_country` | string | | metadata | yes | country of the meet |
| `tested` | 0/1 | | metadata | no | drug-tested category |
| `dl3_weight_kg` | float | kg | decision_input | no | weight of the 3rd attempt = the coach's planned weight |
| `dl2_weight_kg` | float | kg | feature | no | Table 1 #1 |
| `dl2_success` | 0/1 | | feature | no | Table 1 #2 |
| `dl3_jump_pct` | float | % | feature | no | Table 1 #3, 0–25 |
| `bodyweight_kg` | float | kg | feature | no | Table 1 #4 |
| `age_class_group` | `Sub-Junior` \| `Junior` \| `Open` \| `Masters` \| `Unknown` | | feature | no | Table 1 #5 |
| `equipment` | `Raw` \| `Wraps` \| `Single-ply` \| `Multi-ply` \| `Unlimited` | | feature | no | Table 1 #6 |
| `best_squat_kg` | float | kg | feature | no | Table 1 #7 |
| `best_bench_kg` | float | kg | feature | no | Table 1 #8 |
| `dl3_jump_kg` | float | kg | candidate_feature | no | `dl3 − dl2` |
| `dl1_weight_kg` | float | kg | candidate_feature | yes | 1st attempt |
| `dl1_success` | 0/1 | | candidate_feature | yes | 1st attempt good |
| `dl2_jump_pct` | float | % | candidate_feature | yes | DL1 → DL2 jump, **uncapped** (max > 1000 %): winsorize |
| `dl3_to_bodyweight` | float | ratio | candidate_feature | no | `dl3 / bodyweight` |
| `dl3_to_best_squat` | float | ratio | candidate_feature | no | `dl3 / best squat`; long tail from "bar squats" |
| `age_years` | float | years | candidate_feature | yes | `x.5` = approximate |
| `prev_best_deadlift_kg` | float | kg | candidate_feature | yes | best deadlift in strictly earlier meets; empty for first-timers (~31 %) |
| `prev_meets_count` | int | | candidate_feature | no | number of earlier meet dates |
| `sex` | `M` \| `F` \| `Mx` | | segment_only | no | **fairness analysis only, never a model input** |
| `dl3_failed` | 0/1 | | label | no | 1 = 3rd attempt failed |

## Invariants (checked by the validator)

1. All schema columns present; no column from `forbidden_columns` (names, meet names, best deadlift, total,
   place, points).
2. Types, nullability, allowed values, numeric bounds and id patterns as in the schema.
3. `record_id` is unique.
4. Every `athlete_id` has exactly one `split`.
5. `dl3_jump_pct` and `dl3_jump_kg` are consistent with the two weights (±0.01).
6. After a good 2nd attempt the 3rd is strictly heavier.
7. Athlete shares per split within ±2 pp of 70/15/15 (±5 pp, warning only, for samples).
8. With `--metadata`: `schema_version` matches; full files have exactly `records_after_cleaning` rows.

## Loading

Python:

```python
import pandas as pd
df = pd.read_parquet("data/processed/deadlift3_attempts.parquet")
# CSV: read ids as text – some ids are all digits (e.g. "0412…") and must not become numbers
df = pd.read_csv("data/sample/deadlift3_attempts_sample.csv",
                 dtype={"record_id": str, "athlete_id": str}, parse_dates=["meet_date"])
train = df[df["split"] == "train"]
```

JavaScript / TypeScript (e.g. with PapaParse) – per-value type inference would turn all-digit ids into
imprecise numbers, so exclude the id columns:

```ts
Papa.parse(csvText, { header: true, dynamicTyping: (col) => !["record_id", "athlete_id"].includes(col) });
```

Feature lists should be read from the schema instead of hard-coding them:

```python
import json
schema = json.load(open("docs/specs/dataset_schema.json"))
FEATURES = [c["name"] for c in schema["columns"] if c["role"] in ("decision_input", "feature")]
```

## `metadata.json`

| Key | Content |
|---|---|
| `source` | URL, file, CSV name, snapshot date, OPL commit, SHA-256, license, attribution |
| `parameters` | every notebook parameter used for this export (+ salt fingerprint) |
| `funnel` | rows removed / remaining per rule C00–C13 |
| `summary` | period, records, athletes, failure share – the numbers for report 3.1 |
| `splits` | athletes, records, failure rate per split – report Table 2 |
| `category_levels` | allowed values of `equipment`, `age_class_group`, `sex` present in the data (for dropdowns) |
| `feature_ranges_train` | min / p01 / median / p99 / max of every numeric input, **train split only** (for input validation and defaults in the app) |
| `files` | relative paths of all outputs |

## Versioning

`schema_version` (semver) lives in `dataset_schema.json` and is copied into `metadata.json`.
Breaking change (remove / rename / redefine a column) → major; new column → minor; documentation only → patch.
Consumers should check the major version on load and refuse an unknown one.

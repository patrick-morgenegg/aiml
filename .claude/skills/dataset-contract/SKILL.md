---
name: dataset-contract
description: How to load and use the cleaned deadlift3_attempts dataset correctly in any downstream code (model training, evaluation, the coach app, charts) and how to validate files against its schema. Use whenever code reads data/processed/deadlift3_attempts.* or data/sample/deadlift3_attempts_sample.csv, selects features, uses the train/validation/test split, or changes docs/specs/dataset_schema.json.
---

# Use the dataset contract

Source of truth: `docs/specs/dataset_schema.json` (machine-readable) and `docs/specs/04-dataset-contract.md`.

## Loading

- Full data: `pd.read_parquet("data/processed/deadlift3_attempts.parquet")`. Missing? → `refresh-dataset` skill.
- Development and tests: `data/sample/deadlift3_attempts_sample.csv` (5,000 rows, in git).
- CSV: always read `record_id` and `athlete_id` as **strings** (`dtype={"record_id": str, "athlete_id": str}`
  in pandas; exclude them from `dynamicTyping` in PapaParse). Some ids are all digits and would otherwise
  become (imprecise) numbers. Parse `meet_date` as a date.
- On startup compare the schema's major `schema_version` with `metadata.json` and the code's expectation.

## Selecting columns – derive from the schema, never hard-code

```python
import json
schema = json.load(open("docs/specs/dataset_schema.json"))
by_role = lambda *roles: [c["name"] for c in schema["columns"] if c["role"] in roles]
FEATURES = by_role("decision_input", "feature")          # core model inputs (report Table 1)
CANDIDATES = by_role("candidate_feature")                 # only after a leakage-check
LABEL = schema["label"]                                   # dl3_failed, 1 = attempt fails
SEGMENTS = by_role("segment_only")                        # sex – fairness tables only
```

Hard rules:

- Never use `record_id`, `athlete_id`, `split`, `sex` or `metadata` columns as model inputs.
- Fit everything (model, scaler, encoder, imputer, thresholds of baselines) on `split == "train"` only; tune and
  pick the threshold on `validation`; evaluate on `test` once (spec 06).
- Grouped CV inside train: `GroupKFold` with `groups=df["athlete_id"]`.
- `dl3_jump_pct` is derived from `dl3_weight_kg` and `dl2_weight_kg` – compute it the same way at inference.
- Candidate columns with long tails (`dl2_jump_pct`, ratios) need clipping before use.
- Input ranges and dropdown values for UIs come from `metadata.json` (`feature_ranges_train`, `category_levels`).

## Validating

```bash
python scripts/validate_dataset.py <file.parquet|file.csv> [--metadata data/processed/metadata.json]
```

Exit code 0 = OK. Add it to CI for the sample file. Use it after producing any derived table that claims to
follow the contract.

## Changing the contract

1. Edit the notebook and `dataset_schema.json` together; bump `schema_version`
   (major = remove/rename/redefine, minor = add column, patch = wording).
2. Update the column table in `docs/specs/04-dataset-contract.md` and add an entry to `docs/decisions.md`.
3. A new input column must pass the `leakage-check` skill first.
4. Re-run the notebook (`refresh-dataset`) and the validator; commit notebook, schema, docs, metadata and sample
   in one commit.

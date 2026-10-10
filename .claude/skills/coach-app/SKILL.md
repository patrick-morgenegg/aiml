---
name: coach-app
description: Build, extend or review the coach-facing decision-support app that estimates the risk of failing the 3rd deadlift attempt. Use for any work on the application – new screens, the prediction endpoint, model loading, input forms, the decision log, model card or fairness views – and before calling an app feature done.
---

# Coach app

The binding spec is `docs/specs/08-app-integration.md`. Read it before writing app code; this skill is the
working checklist.

## Before coding

1. Read spec 08, plus spec 04 (data) and spec 07 (metrics) for what the app displays.
2. Stack: follow what is already in the repo. If nothing exists, propose Python + Streamlit + scikit-learn
   (spec 08 default) and confirm with the user before scaffolding a different stack.
3. Data for development: `data/sample/deadlift3_attempts_sample.csv`. The app must start with only the
   repository content. Training a real model needs the full Parquet → `refresh-dataset` skill.
4. Load dataset knowledge from files, not literals: `docs/specs/dataset_schema.json` (features, allowed values),
   `data/processed/metadata.json` (input ranges, category levels, snapshot), `models/<version>/model_card.json`
   (threshold, metrics, features).

## Non-negotiables

- Inputs exactly as `AttemptContext` in spec 08; **no sex field**; `dl3_jump_pct` computed, never typed.
- Reject candidates below DL2, equal to DL2 after a good DL2, or with a jump > 25 %; reject values outside the
  schema bounds; flag values outside train p01–p99 as "unusual".
- Output per candidate: `p_fail` (whole percent), `warning` (icon + text, never colour alone), `uncertain` when
  within the uncertainty band of the threshold.
- Never pre-select or recommend "the" weight; the coach decides. Choosing a warned weight is allowed and logged
  as an override.
- No names, meet names or ids in the UI; no per-athlete drill-down; aggregated views need ≥ 20 rows per cell.
- Fit nothing on validation/test; never compute test metrics live in the app – display the model card.
- Show the OpenPowerlifting attribution and the data snapshot on the *Model & data* screen.

## When adding a model input

Run the `leakage-check` skill first, then make sure the field can be provided by the coach at the decision
point and is added to the model card's `features`.

## Definition of done

- Spec 08 acceptance criteria all hold (tick them in the PR description).
- Tests run on the sample CSV: input validation, prediction contract (shape, ranges, determinism), no forbidden
  or `sex` fields in requests/responses.
- `python scripts/validate_dataset.py data/sample/deadlift3_attempts_sample.csv` passes in CI.
- Screens checked in a running app (use the `run` skill if available), including a narrow/mobile width.

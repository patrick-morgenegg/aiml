# CLAUDE.md

KETE course project: predict whether the **3rd deadlift attempt fails** (`dl3_failed = 1`) for a planned weight,
from OpenPowerlifting data. Decision point = right after the 2nd deadlift attempt. Requirements come from the
project report; precise specs are in `docs/` (start at `docs/README.md`).

## Where things are

- Data pipeline: `notebooks/01_data_extraction_and_cleaning.ipynb` (all parameters in its `parameters` cell)
- Dataset contract: `docs/specs/dataset_schema.json` + `docs/specs/04-dataset-contract.md`
- Contract check: `python scripts/validate_dataset.py <file> [--metadata data/processed/metadata.json]`
- Model training + export: `notebooks/02_model_training.ipynb` → `app/model/model.json` (generated, never hand-edit)
- App: `app/` (static HTML + JS, see `app/README.md`); requirements: `docs/specs/08-app-integration.md`
- Tests: `node --test "app/tests/*.test.js"`
- Why things are the way they are: `docs/decisions.md`

## Rules that always apply

- **Leakage:** model inputs only from roles `decision_input` / `feature` (or `candidate_feature` after the
  `leakage-check` skill). Never best deadlift, total, place, points, 4th attempts, later meets, ids.
- **Split:** use the exported athlete-level `split` column. Fit on train, tune on validation, test once.
- **Privacy:** no names, meet names or ids in any output or UI; no per-athlete views.
- **Sex** is for fairness tables only – never an input, field or filter.
- Read feature lists, allowed values and ranges from `dataset_schema.json` / `metadata.json`, not literals.
- Read `record_id` / `athlete_id` as strings when loading CSV.
- The app model must stay monotone: predicted risk never decreases as the planned weight increases.
- Develop and test against `data/sample/deadlift3_attempts_sample.csv`; the full Parquet is git-ignored –
  rebuild it with the `refresh-dataset` skill. Never commit `data/raw/*` or full exports.
- A change to data or schema = notebook + schema + specs + `docs/decisions.md` in one commit, schema version
  bumped, validator passing.

## Skills

`refresh-dataset`, `dataset-contract`, `leakage-check`, `coach-app` (in `.claude/skills/`).

## Language

Code, specs and comments in English. The course report is German: when producing numbers or text for it, use
the German terms of the report («Versuch scheitert», Training/Validierung/Test).

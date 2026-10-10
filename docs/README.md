# Documentation

Specs for the KETE AI/ML project *Risk of failing the 3rd deadlift attempt* (Patrick Morgenegg, Niklas Grün).
The project report (Word) is the source of the requirements; these specs make them precise enough to build on.
Section references such as "report 3.4" point to that report.

## Reading order

| # | Spec | Read it when you… |
|---|---|---|
| 01 | [Project overview](specs/01-project-overview.md) | need the problem, the decision and the decision point in one page |
| 02 | [Data source](specs/02-data-source.md) | download or refresh the OpenPowerlifting data |
| 03 | [Data preparation](specs/03-data-preparation.md) | change or review the cleaning rules (C01–C13) |
| 04 | [Dataset contract](specs/04-dataset-contract.md) | load the cleaned data in any code (the app, a model, a report) |
| 05 | [Features and leakage](specs/05-features-and-leakage.md) | add, remove or question a feature |
| 06 | [Validation split](specs/06-validation-split.md) | train, tune or evaluate anything |
| 07 | [Evaluation and fairness](specs/07-evaluation-and-fairness.md) | compute metrics, baselines or segment checks |
| 08 | [App integration](specs/08-app-integration.md) | build the coach-facing (vibe-coded) application |
| – | [`dataset_schema.json`](specs/dataset_schema.json) | need the machine-readable column contract |
| – | [Decision log](decisions.md) | want to know *why* a rule or parameter is the way it is |
| – | [App README](../app/README.md) | run, test or change the Third Attempt Planner |

## How the pieces fit

```
OpenPowerlifting bulk CSV (Public Domain)
        │  notebooks/01_data_extraction_and_cleaning.ipynb   ← specs 02, 03, 05, 06
        ▼
data/processed/deadlift3_attempts.{parquet,csv} + metadata.json
        │  contract: specs/04 + dataset_schema.json, checked by scripts/validate_dataset.py
        ▼
notebooks/02_model_training.ipynb   ← specs 06, 07  (fit on train, choose on validation)
        │  app/model/model.json (model card)
        ▼
app/  Third Attempt Planner, static HTML + JS   ← spec 08
```

## Rules for changing a spec

1. A spec change that changes the data (a rule, a parameter, a column) also changes the notebook and
   `dataset_schema.json` in the same commit, and gets an entry in [decisions.md](decisions.md).
2. Removing or renaming a column, or changing its meaning, bumps the **major** `schema_version`;
   adding a column bumps the **minor** version.
3. Re-run the notebook and `python scripts/validate_dataset.py data/processed/deadlift3_attempts.parquet`
   before committing.

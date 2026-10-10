---
name: refresh-dataset
description: Rebuild the cleaned deadlift dataset from OpenPowerlifting by running notebooks/01_data_extraction_and_cleaning.ipynb end to end, then validate it. Use when data/processed/deadlift3_attempts.parquet is missing (fresh clone, new machine, cloud session), when a newer OpenPowerlifting snapshot is wanted, or after any change to a cleaning rule, parameter or the dataset schema.
---

# Refresh the dataset

Produces `data/processed/deadlift3_attempts.{parquet,csv}`, `data/processed/metadata.json` and
`data/sample/deadlift3_attempts_sample.csv`. Specs: `docs/specs/02-data-source.md`, `03-data-preparation.md`.

## Steps

1. **Dependencies** – `pip install -r requirements.txt` (pandas, pyarrow, matplotlib, jupyter, nbconvert).

2. **Get the source.** Check in this order and use the first that works:
   - `data/raw/openpowerlifting-latest.zip` already exists and no fresh snapshot is wanted → reuse it.
   - The notebook downloads it itself. Test reachability first:
     `curl -sSI https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip | head -1`
   - Host blocked (403 / timeout) but `gitlab.com` reachable → *Option B* in `docs/specs/02-data-source.md`:
     shallow-clone `opl-data`, `cargo run --release --bin checker -- --compile-onefile`, then set
     `OPL_SOURCE_PATH` to the built CSV (or to a zip packaged like the official one, so the snapshot date and
     commit are recorded). Work in a scratch directory outside the repo.
   - Nothing reachable → stop and ask the user to download the zip manually (Option C).

3. **Run the notebook** from the repository root:
   ```bash
   jupyter nbconvert --to notebook --execute --inplace \
     --ExecutePreprocessor.timeout=3600 notebooks/01_data_extraction_and_cleaning.ipynb
   ```
   Needs ~5 GB free RAM (peak ≈ 4.3 GB measured) and 2–3 minutes after the download. Set `FORCE_DOWNLOAD = True` in the parameters cell
   (or delete the cached zip) for a new snapshot. Do **not** change `OPL_ID_SALT` between runs – it reshuffles
   the split.

4. **Validate** (the last notebook cell does this too; run it explicitly if you changed code):
   ```bash
   python scripts/validate_dataset.py data/processed/deadlift3_attempts.parquet --metadata data/processed/metadata.json
   python scripts/validate_dataset.py data/sample/deadlift3_attempts_sample.csv --metadata data/processed/metadata.json
   ```
   Both must print `OK – contract satisfied`. If a bound fails, inspect the offending rows before touching the
   schema: decide whether it is an entry error (tighten a cleaning rule) or real data (widen the bound), and log
   the decision in `docs/decisions.md`.

5. **Review the diff** of `data/processed/metadata.json`: snapshot date, funnel counts, split shares
   (70/15/15 of athletes), failure rate (~39 %). Large jumps in a funnel step deserve an explanation.

6. **Update numbers that are quoted in docs** if they moved noticeably: `docs/specs/03` (funnel table),
   `06` (split table), `07` (segment sizes), and tell the user which report placeholders (3.1, Table 2) changed.
   The notebook prints a ready-to-paste German table in "Numbers for the report".

7. **Retrain the app model** so `app/` matches the new snapshot:
   ```bash
   jupyter nbconvert --to notebook --execute --inplace notebooks/02_model_training.ipynb
   node --test "app/tests/*.test.js"
   ```
   Compare the validation metrics in `app/model/model.json` with the previous version and mention changes.

## Commit

Commit the executed notebooks, `data/processed/metadata.json`, the sample CSV and the regenerated `app/model/*` and
`app/tests/reference_cases.json`. The full Parquet/CSV and the
raw zip are git-ignored on purpose (`docs/decisions.md` D-10) – never force-add them.

# KETE AI/ML project – risk of failing the 3rd deadlift attempt

Patrick Morgenegg, Niklas Grün · Module KETE (Prof. Dr. U. Michelucci)

After the 2nd deadlift attempt a coach must declare the weight of the 3rd. This project estimates the
probability that the 3rd attempt **fails** for a planned weight (binary classification), using public
competition data from [OpenPowerlifting](https://www.openpowerlifting.org) (Public Domain).

This repository holds the **data preparation**, the **model**, the **specs** and the coach-facing
**[Third Attempt Planner](app/README.md)** – a static HTML/JS app that shows the failure risk of every allowed
3rd-attempt weight and suggests the heaviest weight within the coach's risk limit.

**Try the app:** open `app/index.html` in a browser (no install, no server).

## Quick start

```bash
pip install -r requirements.txt
jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.timeout=3600 notebooks/01_data_extraction_and_cleaning.ipynb
python scripts/validate_dataset.py data/processed/deadlift3_attempts.parquet --metadata data/processed/metadata.json
jupyter nbconvert --to notebook --execute --inplace notebooks/02_model_training.ipynb   # retrain the app model
node --test "app/tests/*.test.js"                                                         # app tests
```

Or open the notebook in Jupyter and *Run All*. The first run downloads ~170 MB. If the download host is blocked
in your network, see *Option B* in [docs/specs/02-data-source.md](docs/specs/02-data-source.md).

## Result (snapshot 2026-10-10, period 2015–2025)

| | |
|---|---|
| Records (one per lifter and meet) | 879,465 |
| Athletes | 343,047 |
| Failed 3rd attempts | 38.7 % |
| Split (athletes) | train 70 % · validation 15 % · test 15 % – grouped by athlete |

Current numbers and the full cleaning funnel: [`data/processed/metadata.json`](data/processed/metadata.json).

Model (validation split): PR-AUC 0.55 vs. 0.39 base rate and 0.43 for "fails if the 2nd attempt failed";
70 % of failed attempts caught at 48 % precision; well calibrated; risk constrained to rise with weight.
Test split (evaluated once, 2026-10-10): precision 0.48, recall 0.70, PR-AUC 0.55 – same as validation.
Details: [docs/specs/07-evaluation-and-fairness.md](docs/specs/07-evaluation-and-fairness.md).

## Repository layout

```
notebooks/01_data_extraction_and_cleaning.ipynb   extract → clean → features → pseudonymise → split → export
notebooks/02_model_training.ipynb                  monotone logistic regression → app/model/model.json
notebooks/03_confusion_matrix.ipynb                confusion matrix of the frozen model on test → docs/figures/
app/                                               Third Attempt Planner (static HTML + JS, works from disk)
scripts/validate_dataset.py                        checks any export against the dataset contract
data/raw/                                          downloaded OpenPowerlifting zip (git-ignored)
data/processed/                                    full Parquet/CSV (git-ignored) + metadata.json (in git)
data/sample/deadlift3_attempts_sample.csv          5,000-row sample for app development and tests (in git)
docs/                                              specs, dataset schema, decision log  → start at docs/README.md
.claude/skills/                                    project skills for AI-assisted ("vibe") coding
CLAUDE.md                                          instructions for coding agents
```

## Skills

| Skill | Use it to |
|---|---|
| [`refresh-dataset`](.claude/skills/refresh-dataset/SKILL.md) | rebuild and validate the dataset (fresh clone, new snapshot, rule change) |
| [`dataset-contract`](.claude/skills/dataset-contract/SKILL.md) | load the data correctly, pick features from the schema, respect the split |
| [`leakage-check`](.claude/skills/leakage-check/SKILL.md) | review a new feature, input field or processing step for leakage |
| [`coach-app`](.claude/skills/coach-app/SKILL.md) | change or review the Third Attempt Planner in `app/` against spec 08 |

In Claude Code they load automatically when relevant, or call them as `/refresh-dataset` etc.

## Data attribution

This project uses data from the OpenPowerlifting project, https://www.openpowerlifting.org.
You may download a copy of the data at https://gitlab.com/openpowerlifting/opl-data.

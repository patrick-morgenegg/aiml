# 05 – Features and leakage

## The leakage rule

> A column may be a model input only if its value is **known when the coach declares the 3rd deadlift**,
> i.e. right after the 2nd deadlift attempt (spec 01, decision point), **and** it generalises to athletes
> the model has never seen.

Everything else is either excluded from the export or carries a non-feature role in `dataset_schema.json`.

## Core features (report Table 1)

| # | Column | Type / unit | Why it helps | Known at decision point because … |
|---|---|---|---|---|
| – | `dl3_weight_kg` | kg | the decision itself – the planned weight | the coach chooses it |
| 1 | `dl2_weight_kg` | kg | strength level on the day, reference for the jump | 2nd attempt is done |
| 2 | `dl2_success` | 0/1 | a missed 2nd hints at bad day form or over-ambitious planning | 2nd attempt is done |
| 3 | `dl3_jump_pct` | % of DL2 | main control variable | derived from DL2 and the planned weight |
| 4 | `bodyweight_kg` | kg | relative load | weigh-in before the meet |
| 5 | `age_class_group` | category | experience and development differ with age | registration |
| 6 | `equipment` | category | equipment changes level and spread | registration |
| 7 | `best_squat_kg` | kg | day form and strength before the deadlift | squat is finished |
| 8 | `best_bench_kg` | kg | day form and accumulated fatigue | bench is finished |

Note: `dl3_jump_pct` is a deterministic function of `dl3_weight_kg` and `dl2_weight_kg`. A model may use
either the pair or the jump plus one weight; the app must compute it from the coach's input, never ask for it
separately.

## Candidate features (report 7.3 "next steps")

Exported with role `candidate_feature`. All are leakage-free by construction; use them after checking the
remaining risks listed here.

| Column | Risk / caveat |
|---|---|
| `dl1_weight_kg`, `dl1_success`, `dl2_jump_pct` | DL1 missing for ~0.01 % of rows; `dl2_jump_pct` has entry-error outliers → winsorize (e.g. at p99) |
| `dl3_jump_kg` | redundant with `dl3_jump_pct` and weights |
| `dl3_to_bodyweight`, `dl3_to_best_squat` | ratios with long tails ("bar squats") → clip or log |
| `age_years` | 9 % missing; `x.5` = approximate |
| `prev_best_deadlift_kg` | strictly earlier meets only; missing for first-timers (~31 %) – missingness itself is informative |
| `prev_meets_count` | experience proxy; depends on federation coverage in OPL |

**In use by the app model** (`notebooks/02_model_training.ipynb`, leakage check 2026-10-10): `prev_best_deadlift_kg`,
with a first-competition indicator. Missing in the data means "no earlier OpenPowerlifting meet", so the app asks the
coach to leave it empty only for a first competition. The model expresses all inputs as log-ratios to the 2nd
attempt or bodyweight; see notebook 02, section 1.

## Excluded – leakage (report 3.4)

| Column | Reason |
|---|---|
| `Best3DeadliftKg` | contains the result of the 3rd attempt |
| `TotalKg` | includes the best deadlift |
| `Place` | decided after the deadlift |
| `Dots`, `Wilks`, `Glossbrenner`, `Goodlift` | computed from the total |
| `Deadlift4Kg` | happens after the 3rd attempt (record attempt) |
| Any value from a **later** meet of the same athlete | future information |

## Excluded – no generalisation / privacy

| Column | Reason |
|---|---|
| `Name` | identifies a person; lets a model memorise individuals |
| `MeetName` | meet-specific, does not transfer to new meets |
| `athlete_id`, `record_id` | ids – a model must never see them |
| `Division` | free text, redundant with age group / equipment |

## Segment-only

`sex` is exported **only** for the fairness checks of report 6.2 (spec 07). It must not be a model input, a
default, or a hidden filter in the app. `federation`, `meet_country`, `meet_year`, `tested` are metadata for
analysis, drift monitoring and a possible time-based split; using one as a feature needs a decision-log
entry (federation as a feature may encode judging strictness, but also data-coverage artefacts).

## Checklist for a new feature

1. Is the value available **before** the 3rd attempt is declared? Name the moment it becomes known.
2. Could it be computed from the outcome of the 3rd attempt, the best deadlift, total, place or points?
3. Does it use information from later meets or from other athletes' later results?
4. Is it an identifier or a high-cardinality proxy of one (name, meet, exact date + federation)?
5. Is it `sex` or a close proxy of it?
6. Can the coach provide it in the app at the decision point (spec 08)?

Any "yes" to 2–5 or "no" to 1 or 6 → do not use it. Otherwise add it to the notebook, to
`dataset_schema.json` (role `candidate_feature`, minor version bump) and to `docs/decisions.md`.
The `leakage-check` skill walks through this list.

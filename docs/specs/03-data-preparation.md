# 03 – Data preparation

Implemented in `notebooks/01_data_extraction_and_cleaning.ipynb`. Parameters live in its `parameters` cell;
the values below are the defaults. The funnel with exact counts of every run is stored in
`data/processed/metadata.json` (`funnel`).

## Pipeline

1. **Extract** – download or reuse the bulk zip, record provenance (spec 02).
2. **Load** – read only the needed columns (spec 02, "Columns used").
3. **History** – from *all* rows compute per athlete and meet date: best deadlift in strictly earlier meets
   and number of earlier meet dates (spec 05).
4. **Filter** – rules C01–C13 below, in this order.
5. **Transform** – decode attempts, label, derived features, age groups.
6. **Pseudonymise** – `athlete_id`, `record_id`; drop `Name`, `MeetName`.
7. **Split** – athlete-level train / validation / test (spec 06).
8. **Explore** – descriptive checks and the numbers for the report (train split only).
9. **Export + validate** – Parquet, CSV, sample, metadata; `scripts/validate_dataset.py` must pass.

## Filter rules

| Rule | Keep rows where … | Why | Removed (2026-10-10) |
|---|---|---|---:|
| C01 | `DATE_MIN ≤ Date ≤ DATE_MAX` (2015-01-01 … 2025-12-31) | report 3.1 period; full years only, the current year is still incomplete | 1,441,862 |
| C02 | `Event ∈ EVENTS` (`SBD`) | squat and bench must be finished before the deadlift to serve as features | 665,756 |
| C03 | `Sanctioned ≠ "No"` | unsanctioned meets use relaxed rules | 5,158 |
| C04 | `Place ∉ {NS, DD}` | no-shows have no attempts; doping DQs are annulled results | 16,865 |
| C05 | `Equipment ≠ Straps` | strapped deadlifts are exhibitions, not real meets | 1 |
| C06 | `Deadlift2Kg` and `Deadlift3Kg` present and ≠ 0 | label and features need attempt-level data | 953,557 |
| C07 | `Best3SquatKg > 0` and `Best3BenchKg > 0` | lifter is still in the competition at the decision point | 20,034 |
| C08 | `BodyweightKg` within 20–300 kg | required feature, plausibility | 196 |
| C09 | deadlift attempts within 20–500 kg (DL1 if present), best squat 10–600 kg, best bench 5–400 kg | entry errors (e.g. 1 kg squats). 20–25 kg "bar squats" of injured lifters are real and kept | 80 |
| C10 | `|DL3| ≥ |DL2| ≥ |DL1|`, and strictly heavier after a good attempt | rules of the sport; violations are entry errors | 2 |
| C11 | jump `(|DL3| − |DL2|) / |DL2| ≤ 25 %` | larger jumps are almost always entry errors (~0.15 %) | 1,325 |
| C12 | first row per `Name, Date, Federation, MeetName, DL1, DL2, DL3` | same lifter listed in several divisions (e.g. Open and Junior) | 62,110 |
| C13 | label defined | safety net | 0 |
| | **Result** | | **879,465 rows, 343,047 athletes** |

Kept on purpose:

* `Place = DQ` – includes lifters who failed all three deadlifts (bomb-out). Removing them would remove
  failed 3rd attempts and bias the label. Lifters who bombed squat or bench are removed by C07 instead.
* `Place = G` (guest lifters) – their attempts are real.
* Missing age – becomes `age_class_group = "Unknown"` instead of dropping ≈ 6.6 % of rows.
* Jump of 0 % – repeating the weight after a **failed** 2nd attempt is normal (~8 % of rows).

## Transformations

| Output | Rule |
|---|---|
| `dlN_weight_kg` | `abs(DeadliftNKg)`, 2 decimals |
| `dlN_success` | `1` if `DeadliftNKg > 0`, `0` if `< 0`; `dl1_success` empty if DL1 not recorded |
| `dl3_failed` (label) | `1` if `Deadlift3Kg < 0` else `0` |
| `dl3_jump_pct` | `(dl3_weight_kg − dl2_weight_kg) / dl2_weight_kg × 100`, 2 decimals |
| `dl3_jump_kg` | `dl3_weight_kg − dl2_weight_kg` |
| `dl2_jump_pct` | same for DL1 → DL2 (uncapped candidate) |
| `dl3_to_bodyweight`, `dl3_to_best_squat` | ratios, 4 decimals |
| `age_years` | `Age` if within 5–100 years, else empty |
| `age_class_group` | see below |
| `tested` | `1` if `Tested = Yes` else `0` |
| `meet_year` | year of `meet_date` |

### Age groups (report Table 1, #5)

IPF-style groups. First available source wins:

1. `BirthYearClass` (the IPF definition): `14-18` → Sub-Junior, `19-23` → Junior, `24-39` → Open, `40-…` → Masters
2. `Age` (5–100 years): `< 19` Sub-Junior, `19–23` Junior, `24–39` Open, `≥ 40` Masters
3. `AgeClass`: `5-12`, `13-15`, `16-17` → Sub-Junior; `18-19`, `20-23` → Junior; `24-34`, `35-39` → Open; `40-…` → Masters
4. otherwise `Unknown`

Source shares in scope (2026-10-10): `BirthYearClass` ≈ 91 %, `Age` ≈ 2 %, `AgeClass` ≈ 0.4 %, `Unknown` ≈ 6.6 %.
`18-19` is mapped to Junior although 18-year-olds are Sub-Juniors under IPF rules; as `AgeClass` is used for
only ≈ 0.4 % of rows, the effect is negligible.

## Pseudonymisation (report 6.5)

* `athlete_id = sha256(OPL_ID_SALT + Name)[:16]` (hex). `record_id = sha256(athlete_id | Date | Federation |
  MeetName | Equipment | DL1 | DL2 | DL3)[:16]`.
* `Name` and `MeetName` never leave the notebook. Exports must not contain any column from
  `forbidden_columns` in `dataset_schema.json`; the validator enforces this.
* Salt: environment variable `OPL_ID_SALT`. Without it the project default is used and `metadata.json`
  records `id_salt_source = "project default"`. Because OpenPowerlifting is public, the default is
  acceptable for the course; set a private salt if the ids must not be recomputable from names.
  **Changing the salt changes every id and therefore the split** – pick it once and keep it.
  `metadata.json` stores an 8-character fingerprint so a changed salt is detectable.

## Outputs

See spec 04. All outputs are regenerated on every run; nothing is edited by hand.

# 02 – Data source: OpenPowerlifting

## Source

| | |
|---|---|
| Publisher | The OpenPowerlifting Project, <https://www.openpowerlifting.org> |
| Bulk download | <https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip> (rebuilt nightly) |
| Docs | <https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html> (column definitions) |
| Source repository | <https://gitlab.com/openpowerlifting/opl-data> |
| License | Public Domain (`LICENSE.txt` in the zip). Attribution is requested, not required. |
| Size (snapshot 2026-10-10) | zip ≈ 170 MB, CSV ≈ 830 MB, 4,046,411 rows, 42 columns |
| Granularity | one row = one lifter's entry in one division of one meet |

Attribution text to show in the app and the report:

> This project uses data from the OpenPowerlifting project, https://www.openpowerlifting.org.

## Zip layout

```
openpowerlifting-YYYY-MM-DD/
├── openpowerlifting-YYYY-MM-DD-<commit>.csv   ← the data
├── LICENSE.txt
└── README.txt                                 ← column documentation
```

The notebook parses snapshot date and commit from the CSV name and stores them, together with the file's
SHA-256, in `data/processed/metadata.json` → every export is traceable to an exact source version.

## Columns used

| Column | Used for | Notes |
|---|---|---|
| `Name` | pseudonymous `athlete_id`, deduplication, history | **dropped** before export. Namesakes are disambiguated by OPL (`John Doe #1`). |
| `Sex` | `sex` (fairness only) | `M`, `F`, `Mx` |
| `Event` | filter C02 | `SBD` = full power |
| `Equipment` | feature | `Raw`, `Wraps`, `Single-ply`, `Multi-ply`, `Unlimited`, `Straps` |
| `Age`, `BirthYearClass`, `AgeClass` | `age_class_group`, `age_years` | `x.5` ages are approximate (birth year only) |
| `BodyweightKg` | feature | |
| `Best3SquatKg`, `Best3BenchKg` | features, filter C07 | best successful lift of the meet |
| `Deadlift1Kg`…`Deadlift3Kg` | label and features | **negative = failed attempt**; empty = not recorded |
| `Best3DeadliftKg` | history of *earlier* meets only | never for the current row (leakage) |
| `Place` | filter C04 | number, `G` guest, `DQ`, `DD` doping DQ, `NS` no-show |
| `Tested` | metadata | `Yes` or empty |
| `Federation`, `MeetCountry` | metadata | |
| `Date` | filter C01, history, `meet_date` | ISO 8601, start date of the meet |
| `MeetName` | deduplication, `record_id` | **dropped** before export |
| `Sanctioned` | filter C03 | `Yes` / `No` |

Not loaded at all: `Division`, `WeightClassKg`, single squat/bench attempts, `Deadlift4Kg` (record attempts),
`TotalKg`, `Dots`, `Wilks`, `Glossbrenner`, `Goodlift`, `Country`, `State`, `ParentFederation`,
`MeetState`, `MeetTown`.

## Units

All weights are kilograms. OpenPowerlifting converts meets held in pounds (1 lb = 0.45359237 kg) and stores
up to two decimals, so converted weights like `229.06` appear; differences of a few tenths of a kg are
rounding, not errors. No further unit conversion is done.

## Getting the data

**Option A – default.** Run the notebook. It downloads the zip to `data/raw/openpowerlifting-latest.zip`
(git-ignored) and reuses it on later runs. Set `FORCE_DOWNLOAD = True` for a fresh snapshot.

**Option B – `openpowerlifting.gitlab.io` blocked** (some company networks and cloud sandboxes allow
`gitlab.com` but not GitLab Pages). Build the identical CSV from the source repository with the project's own
tool (needs `git` and a Rust toolchain, ~2 GB disk, a few minutes):

```bash
git clone --depth 1 https://gitlab.com/openpowerlifting/opl-data.git
cd opl-data && cargo run --release --bin checker -- --compile-onefile   # writes build/openpowerlifting.csv
export OPL_SOURCE_PATH="$PWD/build/openpowerlifting.csv"               # then run the notebook
```

To keep the provenance parsing, package it like the official zip
(`openpowerlifting-<date>/openpowerlifting-<date>-<short-commit>.csv`, see the
[opl-csv Makefile](https://gitlab.com/openpowerlifting/opl-csv/-/blob/main/Makefile)); with a bare
`openpowerlifting.csv` snapshot date and commit are recorded as `null`.

**Option C – manual.** Download the zip in a browser and set `OPL_SOURCE_PATH` to it.

## Known data properties (snapshot 2026-10-10)

* Only ~35 % of all rows carry single attempts; many federations report best lifts only (→ rule C06).
* Lifters entered in several divisions of the same meet appear several times with identical attempts
  (→ rule C12, ~62 k duplicates in scope).
* Judging standards differ between federations and referees: the label is noisy.
* Only the *last declared* 3rd-attempt weight is recorded; changes of the declaration are invisible.
* Rare entry errors: squats of 1–2 kg, ages of 3.5 years, jumps of > 100 % (→ C09, C11, age bounds).

#!/usr/bin/env python3
"""Validate a deadlift3_attempts export against docs/specs/dataset_schema.json.

Usage:
    python scripts/validate_dataset.py data/processed/deadlift3_attempts.parquet
    python scripts/validate_dataset.py data/sample/deadlift3_attempts_sample.csv --metadata data/processed/metadata.json

Exit code 0 = contract satisfied, 1 = at least one error. Warnings never fail the run.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = ROOT / "docs" / "specs" / "dataset_schema.json"


def load_table(path: Path, schema: dict) -> pd.DataFrame:
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    if path.suffix == ".csv":
        # Ids are hex strings, some all digits: read every text column as text so none becomes a number.
        text_columns = {c["name"]: str for c in schema["columns"] if c["dtype"] in ("string", "category")}
        return pd.read_csv(path, dtype=text_columns, keep_default_na=True)
    raise SystemExit(f"unsupported file type: {path.suffix} (use .parquet or .csv)")


def validate(frame: pd.DataFrame, schema: dict, metadata: dict | None, full_size: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    spec = {c["name"]: c for c in schema["columns"]}

    missing = [name for name in spec if name not in frame.columns]
    if missing:
        errors.append(f"missing columns: {missing}")
    forbidden = sorted(set(schema["forbidden_columns"]) & set(frame.columns))
    if forbidden:
        errors.append(f"forbidden (PII / leakage) columns present: {forbidden}")
    extra = sorted(set(frame.columns) - set(spec) - set(forbidden))
    if extra:
        warnings.append(f"columns not in the schema: {extra}")
    if not len(frame):
        errors.append("table is empty")
        return errors, warnings

    for name, col in spec.items():
        if name not in frame.columns:
            continue
        values = frame[name]
        present = values.dropna()
        if not col["nullable"] and values.isna().any():
            errors.append(f"{name}: {int(values.isna().sum())} missing values in a non-nullable column")
        if col["dtype"] in ("int", "float"):
            numeric = pd.to_numeric(present, errors="coerce").astype("float64")
            if numeric.isna().any():
                errors.append(f"{name}: {int(numeric.isna().sum())} non-numeric values")
                continue
            if col["dtype"] == "int" and not np.allclose(numeric, numeric.round()):
                errors.append(f"{name}: non-integer values in an int column")
            if "min" in col and (numeric < col["min"]).any():
                errors.append(f"{name}: {int((numeric < col['min']).sum())} values below {col['min']} (min {numeric.min()})")
            if "max" in col and (numeric > col["max"]).any():
                errors.append(f"{name}: {int((numeric > col['max']).sum())} values above {col['max']} (max {numeric.max()})")
            present = numeric
        elif col["dtype"] == "date":
            parsed = pd.to_datetime(present, errors="coerce")
            if parsed.isna().any():
                errors.append(f"{name}: {int(parsed.isna().sum())} unparseable dates")
        if "allowed" in col:
            bad = set(present.unique()) - set(col["allowed"])
            if bad:
                errors.append(f"{name}: values outside {col['allowed']}: {sorted(map(str, bad))[:10]}")
        if "pattern" in col:
            pattern = re.compile(col["pattern"])
            bad = (~present.astype(str).map(lambda v: bool(pattern.match(v)))).sum()
            if bad:
                errors.append(f"{name}: {int(bad)} values do not match {col['pattern']}")
        if col.get("unique") and values.duplicated().any():
            errors.append(f"{name}: {int(values.duplicated().sum())} duplicate values in a unique column")

    if errors:
        return errors, warnings

    # Cross-field rules (docs/specs/04-dataset-contract.md, section "Invariants")
    group, split, label = schema["group_key"], schema["split_column"], schema["label"]
    if (frame.groupby(group)[split].nunique() > 1).any():
        errors.append(f"{group} appears in more than one {split} (athlete-level split violated)")

    jump = (frame["dl3_weight_kg"] - frame["dl2_weight_kg"]) / frame["dl2_weight_kg"] * 100
    if ((jump - frame["dl3_jump_pct"]).abs() > 0.011).any():
        errors.append("dl3_jump_pct inconsistent with dl3_weight_kg / dl2_weight_kg")
    if ((frame["dl3_weight_kg"] - frame["dl2_weight_kg"] - frame["dl3_jump_kg"]).abs() > 0.011).any():
        errors.append("dl3_jump_kg inconsistent with dl3_weight_kg - dl2_weight_kg")
    if ((frame["dl2_success"] == 1) & (frame["dl3_jump_kg"] <= 0)).any():
        errors.append("3rd attempt not heavier after a good 2nd attempt")
    if not set(frame[label].unique()) <= {0, 1}:
        errors.append(f"{label} must be binary 0/1")
    elif frame[label].nunique() < 2:
        warnings.append(f"{label} has a single class in this file")

    athletes = frame.drop_duplicates(group)[split].value_counts(normalize=True)
    tolerance = 0.02 if full_size else 0.05
    for name, ratio in schema["split_ratios"].items():
        share = float(athletes.get(name, 0.0))
        if abs(share - ratio) > tolerance:
            (errors if full_size else warnings).append(
                f"athlete share of '{name}' is {share:.3f}, expected {ratio:.2f} ± {tolerance}")

    if metadata is not None:
        if metadata.get("schema_version") != schema["schema_version"]:
            errors.append(f"metadata schema_version {metadata.get('schema_version')} != schema {schema['schema_version']}")
        expected = metadata.get("summary", {}).get("records_after_cleaning")
        if full_size and expected is not None and expected != len(frame):
            errors.append(f"row count {len(frame)} != metadata records_after_cleaning {expected}")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("table", type=Path, help=".parquet or .csv export")
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--metadata", type=Path, help="metadata.json written by the notebook (optional)")
    args = parser.parse_args()

    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    metadata = json.loads(args.metadata.read_text(encoding="utf-8")) if args.metadata else None
    frame = load_table(args.table, schema)
    # Files with "sample" in the name are subsets: row counts and split shares are only checked loosely.
    full_size = "sample" not in args.table.name
    errors, warnings = validate(frame, schema, metadata, full_size)

    print(f"{args.table.name}: {len(frame):,} rows, {frame.shape[1]} columns, schema {schema['schema_version']}")
    for message in warnings:
        print(f"  WARN  {message}")
    for message in errors:
        print(f"  ERROR {message}")
    print("  OK – contract satisfied" if not errors else f"  FAILED – {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

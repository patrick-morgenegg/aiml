---
name: coach-app
description: Build, extend or review the Third Attempt Planner in app/ – the static HTML/JS decision-support app that shows the risk of failing the 3rd deadlift attempt for every allowed weight and suggests the heaviest weight within the coach's risk limit. Use for any work on the app (screens, inputs, prediction logic in app/js/model.js, chart, decision log, model card view) and whenever the model export in notebooks/04_model_v2.ipynb (or v1 in notebooks/02_model_training.ipynb) changes.
---

# Coach app

Binding spec: `docs/specs/08-app-integration.md`. App overview: `app/README.md`. Read both before changing app code.

## Architecture (keep it)

- Static HTML + CSS + classic `<script>` files – no build step, no framework, no server; `index.html` must keep
  working when opened from disk (that is why the model ships as `model/model-data.js`, a global, not a fetched
  JSON or an ES module).
- `js/model.js` holds all prediction logic as pure functions (UMD: `window.DeadliftModel` and `require`). UI code
  (`js/app.js`, `js/chart.js`) never computes features or risks itself.
- The model card (`app/model/model.json` + `model-data.js`, model v2: gradient-boosted trees) is **generated** by
  `notebooks/04_model_v2.ipynb`, section 6. `model_v1.json` (logistic regression) comes from notebook 02 and stays as
  the tested baseline. Features are rounded to 9 decimals before the trees in both Python and JS (D-21).
  Never edit it by hand; change the notebook and re-run it.
- Colours only through the CSS tokens in `styles.css` (light + dark blocks); status = icon + text, never colour alone.

## Non-negotiables

- Inputs exactly as `AttemptContext` in spec 08; **no sex field**; jump % is computed, never typed;
  an empty previous best means "first competition" and the UI must say so.
- Risk must never decrease when the planned weight increases. Any new weight-dependent feature must be
  non-decreasing in the weight and a `+1` entry in `monotonic_cst` in notebook 04 (`MONOTONE`).
- The suggestion is the heaviest allowed weight within the limit **the coach sets**; always show the full curve and
  table with it; never declare a weight; logging a weight above the limit is allowed and marked as override.
- Reject weights below DL2, equal to DL2 after a good DL2, or above +25 %; reject inputs outside the bounds; flag
  inputs outside the train 1st–99th percentile.
- No names, meet names or ids; nothing leaves the browser; no per-athlete views.
- Metrics come from the model card: validation metrics plus the one-time 2026 hold-out (D-20, D-21). The test
  split was used once for v1 (D-18) and is not shown for v2.

## When adding a model input

Run the `leakage-check` skill first, confirm the coach can provide it at the decision point, add it to
`v2_features()` in notebook 04 **and** `featuresV2()` in `js/model.js` (same formula), add it to `AttemptContext` in
spec 08, re-run the notebook, then the tests. A new input means a new model: choose it on validation only (D-19).

## Definition of done

- `node --test "app/tests/*.test.js"` passes (Python/JS agreement to 1e-9, monotonicity, attempt rules, suggestion,
  validation, no sex, determinism).
- `python scripts/validate_dataset.py data/sample/deadlift3_attempts_sample.csv` passes.
- The page is checked in a browser at desktop and phone width (≈390 px), light and dark: no horizontal scroll,
  no console errors, chart labels readable.
- Spec 08 acceptance criteria still hold; new decisions go into `docs/decisions.md`.

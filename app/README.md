# Third Attempt Planner

A static HTML + JavaScript app for coaches and athletes. After the 2nd deadlift attempt you enter the situation;
the app shows the predicted failure risk for every allowed 3rd-attempt weight and suggests the **heaviest weight
that stays within your risk limit**, with the IPF plate loading for it. Everything runs in the browser – no
server, no account, nothing leaves the device.

## Open it

* Double-click `index.html` (works from disk), or
* serve the folder: `python -m http.server 8000 --directory app` → <http://localhost:8000>, or
* publish the folder as-is on any static host (e.g. GitHub Pages with `app/` as the site root).

Fonts load from Google Fonts when online; offline the app falls back to system fonts.

## How it decides

1. **Inputs** (spec 08 `AttemptContext`): 1st and 2nd attempt weight and result, best squat and bench of the day,
   bodyweight, equipment, age group, number of earlier competitions, and optionally the previous best competition
   deadlift. There is no sex
   field – sex is used only for the fairness table.
2. **Candidates**: every weight in the chosen increment (2.5 / 1 / 0.5 kg) from the smallest allowed jump
   (heavier after a good 2nd, a missed 2nd may be repeated) up to +25 %.
3. **Risk**: model v2, gradient boosting with 825 small decision trees, trained in `notebooks/04_model_v2.ipynb` on
   616,069 third attempts from OpenPowerlifting (decisions D-20, D-21). It is constrained so that **more weight never
   looks safer** – see "Limits" below. Model v1 (logistic regression, `notebooks/02_model_training.ipynb`) stays in
   `model/model_v1.json` as the tested baseline.
4. **Suggestion**: the heaviest candidate whose risk stays within your limit, set either as
   *extra risk over the smallest allowed jump* (default +5 points; presets 2 / 5 / 10) or as a *maximum failure
   risk* (default 35 %, the model's validation threshold). The coach decides; the suggestion is one input.
5. **Close to the limit**: candidates within ±2 points of the limit are marked – the model cannot meaningfully
   tell them apart.

Validation results of v2 (131,443 attempts): PR-AUC 0.57 (v1 0.55, base rate 0.39, "2nd attempt failed" rule 0.43);
at a 35 % threshold it catches 70 % of failed attempts with 49 % precision; predicted risks are well calibrated.
On the 2026 time hold-out (81,900 attempts, evaluated once): precision 0.50, recall 0.72, PR-AUC 0.58 vs. v1 0.49 /
0.72 / 0.56. The 2015–2025 test split was used once for v1 (2026-10-10: 0.48 / 0.70 / 0.55, D-18), so it is not shown
for v2. *Model & data* shows validation numbers, baselines, calibration and segments plus the hold-out sentence.

## Limits

* In competition data, coaches already choose small jumps after a slow 2nd attempt, so small jumps *look* risky.
  The model is constrained not to learn that, which leaves the risk flat up to about +5 %. It cannot show how
  much safer a small jump really is for your athlete.
* Day form, warm-ups, bar speed and weight cutting are not in the data.
* At the same threshold, recall is lower for women (0.54) than for men (0.77; v1: 0.49 vs. 0.79) at similar
  precision (0.47 vs. 0.50), because women's 3rd attempts fail less often. Shown in *Model & data → Fairness and segments*.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | page and styles (light and dark theme) |
| `js/model.js` | prediction logic: features, risk, candidates, suggestion, validation, plate loading (pure functions, also runs in Node) |
| `js/chart.js` | risk curve (SVG, hover / touch / arrow keys) |
| `js/app.js` | UI wiring, decision log (browser `localStorage`, copy as CSV) |
| `model/model.json` | model card v2: trees, threshold, metrics, calibration, segments, input ranges |
| `model/model_v1.json` | model card v1 (logistic regression), kept as the tested baseline |
| `model/model-data.js` | the same object as `window.DEADLIFT_MODEL` so the page works from disk – generated, do not edit |
| `tests/` | Node tests and the reference probabilities from Python |

## Update the model

```bash
# after a data refresh (notebook 01) or a model change
jupyter nbconvert --to notebook --execute --inplace notebooks/02_model_training.ipynb   # v1 → model_v1.json
jupyter nbconvert --to notebook --execute --inplace notebooks/04_model_v2.ipynb          # v2 → model.json
node --test "app/tests/*.test.js"
```

Notebook 04 rewrites `model/model.json`, `model/model-data.js` and `tests/reference_cases.json` (notebook 02 only
`model/model_v1.json` and `tests/reference_cases_v1.json`); the tests check that the JavaScript reproduces the Python
probabilities of both models to 1e-9 and that risk never decreases with weight. Features are rounded to 9 decimals
before the trees on both sides (D-21) – keep that if you change the export.

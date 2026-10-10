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

1. **Inputs** (spec 08 `AttemptContext`): 2nd attempt weight and result, best squat and bench of the day,
   bodyweight, equipment, age group, and optionally the previous best competition deadlift. There is no sex
   field – sex is used only for the fairness table.
2. **Candidates**: every weight in the chosen increment (2.5 / 1 / 0.5 kg) from the smallest allowed jump
   (heavier after a good 2nd, a missed 2nd may be repeated) up to +25 %.
3. **Risk**: a logistic regression trained in `notebooks/02_model_training.ipynb` on 616,069 third attempts
   from OpenPowerlifting. It is constrained so that **more weight never looks safer** – see "Limits" below.
4. **Suggestion**: the heaviest candidate whose risk stays within your limit, set either as
   *extra risk over the smallest allowed jump* (default +5 points; presets 2 / 5 / 10) or as a *maximum failure
   risk* (default 35 %, the model's validation threshold). The coach decides; the suggestion is one input.
5. **Close to the limit**: candidates within ±2 points of the limit are marked – the model cannot meaningfully
   tell them apart.

Validation results (131,443 attempts): PR-AUC 0.55 (base rate 0.39, "2nd attempt failed" rule 0.43); at a 35 %
threshold it catches 70 % of failed attempts with 48 % precision; predicted risks are well calibrated. The test
split has not been used yet (see notebook 02, `EVALUATE_TEST`).

## Limits

* In competition data, coaches already choose small jumps after a slow 2nd attempt, so small jumps *look* risky.
  The model is constrained not to learn that, which leaves the risk flat up to about +5 %. It cannot show how
  much safer a small jump really is for your athlete.
* Day form, warm-ups, bar speed and weight cutting are not in the data.
* At the same threshold, recall is lower for women (0.49) than for men (0.79) while precision is equal (0.48),
  because women's 3rd attempts fail less often. Shown in *Model & data → Fairness and segments*.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | page and styles (light and dark theme) |
| `js/model.js` | prediction logic: features, risk, candidates, suggestion, validation, plate loading (pure functions, also runs in Node) |
| `js/chart.js` | risk curve (SVG, hover / touch / arrow keys) |
| `js/app.js` | UI wiring, decision log (browser `localStorage`, copy as CSV) |
| `model/model.json` | model card: coefficients, threshold, metrics, calibration, segments, input ranges |
| `model/model-data.js` | the same object as `window.DEADLIFT_MODEL` so the page works from disk – generated, do not edit |
| `tests/` | Node tests and the reference probabilities from Python |

## Update the model

```bash
# after a data refresh (notebook 01) or a model change
jupyter nbconvert --to notebook --execute --inplace notebooks/02_model_training.ipynb
node --test "app/tests/*.test.js"
```

The notebook rewrites `model/model.json`, `model/model-data.js` and `tests/reference_cases.json`; the tests check
that the JavaScript reproduces the Python probabilities to 1e-9 and that risk never decreases with weight.

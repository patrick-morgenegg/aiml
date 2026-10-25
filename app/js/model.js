/*
 * Prediction logic for the Third Attempt Planner. Pure functions, no DOM access.
 * Two model kinds, chosen by the model card:
 *   - "gbm" (v2, in use): gradient-boosted trees, notebooks/04_model_v2.ipynb (v2_features / predict_from_trees)
 *   - logistic regression (v1, baseline): notebooks/02_model_training.ipynb (make_features / predict)
 * app/tests/model.test.js checks that both reproduce the Python probabilities.
 * Works as a classic browser script (window.DeadliftModel) and in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeadliftModel = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BAR_AND_COLLARS_KG = 25; // IPF: 20 kg bar + 2 x 2.5 kg collars
  const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25];
  const OPTIONAL_INPUTS = ["prev_best_deadlift_kg"];
  const COUNT_INPUTS = ["prev_meets_count"];
  const LABELS = {
    dl1_weight_kg: "1st attempt weight",
    dl2_weight_kg: "2nd attempt weight",
    bodyweight_kg: "Bodyweight",
    best_squat_kg: "Best squat today",
    best_bench_kg: "Best bench today",
    prev_best_deadlift_kg: "Previous best deadlift",
    prev_meets_count: "Number of earlier competitions",
    rel_strength: "2nd attempt relative to bodyweight",
    squat_ratio: "Squat relative to the 2nd deadlift",
    bench_ratio: "Bench relative to the 2nd deadlift",
    pb_gap: "2nd attempt relative to the previous best",
  };

  const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const hasValue = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(v);

  const isGbm = (model) => model.model_kind === "gbm";

  /** Model features for one planned 3rd-attempt weight. Returns {featureName: value}. */
  function features(model, ctx, plannedKg) {
    return isGbm(model) ? featuresV2(model, ctx, plannedKg) : featuresV1(model, ctx, plannedKg);
  }

  /** v2: same inputs as v1 plus the 1st attempt and the number of earlier competitions (notebook 04, v2_features). */
  function featuresV2(model, ctx, plannedKg) {
    const s = ctx.dl2_success ? 1 : 0;
    const dl2 = ctx.dl2_weight_kg;
    const hasPb = hasValue(ctx.prev_best_deadlift_kg);
    const pb = hasPb ? ctx.prev_best_deadlift_kg : 1;
    const gapClip = model.constants.pb_gap_clip;
    const gap = hasPb ? clip(Math.log(dl2 / pb), -gapClip, gapClip) : 0;
    const hasDl1 = hasValue(ctx.dl1_weight_kg);
    const [j12lo, j12hi] = model.constants.jump12_clip;
    const x = {
      dl2_success: s,
      rel_strength: Math.log(dl2 / ctx.bodyweight_kg),
      log_bodyweight: Math.log(ctx.bodyweight_kg),
      squat_ratio: Math.log(ctx.best_squat_kg / dl2),
      bench_ratio: Math.log(ctx.best_bench_kg / dl2),
      has_prev_best: hasPb ? 1 : 0,
      pb_gap: gap,
    };
    const cats = model.categories;
    for (const level of cats.equipment) {
      if (level !== cats.equipment_baseline) x["equipment_" + level] = ctx.equipment === level ? 1 : 0;
    }
    for (const level of cats.age_class_group) {
      if (level !== cats.age_baseline) x["age_" + level] = ctx.age_class_group === level ? 1 : 0;
    }
    x.jump = Math.log(plannedKg / dl2);
    x.pr_excess = hasPb ? Math.max(0, Math.log(plannedKg / pb)) - Math.max(0, Math.log(dl2 / pb)) : 0;
    x.has_dl1 = hasDl1 ? 1 : 0;
    x.dl1_success = hasDl1 ? (ctx.dl1_success ? 1 : 0) : 1;
    x.jump12 = hasDl1 ? clip(Math.log(dl2 / ctx.dl1_weight_kg), j12lo, j12hi) : 0;
    x.log_prev_meets = Math.log1p(ctx.prev_meets_count);
    return x;
  }

  /** v1: logistic-regression features (notebook 02, make_features). */
  function featuresV1(model, ctx, plannedKg) {
    const s = ctx.dl2_success ? 1 : 0;
    const dl2 = ctx.dl2_weight_kg;
    const hasPb = hasValue(ctx.prev_best_deadlift_kg);
    const pb = hasPb ? ctx.prev_best_deadlift_kg : 1;
    const jump = Math.log(plannedKg / dl2);
    const gapClip = model.constants.pb_gap_clip;
    const gap = hasPb ? clip(Math.log(dl2 / pb), -gapClip, gapClip) : 0;

    const x = {
      dl2_success: s,
      rel_strength: Math.log(dl2 / ctx.bodyweight_kg),
      log_bodyweight: Math.log(ctx.bodyweight_kg),
      squat_ratio: Math.log(ctx.best_squat_kg / dl2),
      bench_ratio: Math.log(ctx.best_bench_kg / dl2),
      has_prev_best: hasPb ? 1 : 0,
      pb_gap: gap,
      pb_gap_pos: Math.max(gap, 0),
    };
    const cats = model.categories;
    for (const level of cats.equipment) {
      if (level !== cats.equipment_baseline) x["equipment_" + level] = ctx.equipment === level ? 1 : 0;
    }
    for (const level of cats.age_class_group) {
      if (level !== cats.age_baseline) x["age_" + level] = ctx.age_class_group === level ? 1 : 0;
    }
    x.jump_after_good = jump * s;
    x.jump_after_miss = jump * (1 - s);
    const kinkNames = model.features.map((f) => f.name).filter((n) => n.startsWith("jump_over_"));
    model.constants.jump_kinks.forEach((kink, i) => {
      x[kinkNames[i]] = Math.max(0, jump - Math.log1p(kink));
    });
    x.pr_excess = hasPb ? Math.max(0, Math.log(plannedKg / pb)) - Math.max(0, Math.log(dl2 / pb)) : 0;
    return x;
  }

  /** Probability that the 3rd attempt fails at plannedKg. */
  function predict(model, ctx, plannedKg) {
    const x = features(model, ctx, plannedKg);
    if (isGbm(model)) return predictTrees(model, x);
    let z = model.intercept;
    for (const [name, coef] of Object.entries(model.coefficients)) {
      if (!(name in x)) throw new Error("feature not computed: " + name);
      z += coef * x[name];
    }
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * Gradient-boosted trees: sigmoid(baseline + sum of one leaf value per tree). Go left if value <= threshold.
   * Features are first rounded to `feature_rounding_decimals` (same formula as notebook 04, decision D-21), so a
   * last-bit difference between the browser's and numpy's logarithm cannot send a case down another branch.
   */
  function predictTrees(model, x) {
    const scale = Math.pow(10, model.feature_rounding_decimals);
    const vec = model.features.map((f) => {
      const v = x[f.name];
      if (typeof v !== "number" || Number.isNaN(v)) throw new Error("feature not computed: " + f.name);
      return Math.floor(v * scale + 0.5) / scale;
    });
    let raw = model.baseline;
    for (const tree of model.trees) {
      let node = 0;
      while (tree.f[node] >= 0) node = vec[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node];
      raw += tree.v[node];
    }
    return 1 / (1 + Math.exp(-raw));
  }

  const fmtKg = (v) => `${Number(v.toFixed(2))} kg`;
  const unit = (name) => (COUNT_INPUTS.includes(name) ? "" : " kg");
  const fmtValue = (name, v) => (COUNT_INPUTS.includes(name) ? String(v) : fmtKg(v));

  /**
   * Check an attempt context. errors: {field: message} – blocking. notes: [message] – inputs outside the range
   * the model has seen often (train 1st–99th percentile); prediction still shown but less reliable.
   */
  function validateContext(model, ctx) {
    const errors = {};
    const notes = [];
    const bounds = model.input_bounds;
    const inputs = Object.keys(bounds);
    for (const name of inputs) {
      const v = ctx[name];
      const optional = OPTIONAL_INPUTS.includes(name);
      if (!hasValue(v)) {
        if (!optional) errors[name] = COUNT_INPUTS.includes(name) ? `Enter the ${LABELS[name].toLowerCase()} (0 for a first competition).`
          : `Enter the ${LABELS[name].toLowerCase()} in kg.`;
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) {
        errors[name] = `${LABELS[name]} must be a number.`;
      } else if (COUNT_INPUTS.includes(name) && !Number.isInteger(v)) {
        errors[name] = `${LABELS[name]} must be a whole number.`;
      } else if (v < bounds[name].min || v > bounds[name].max) {
        errors[name] = `${LABELS[name]} must be between ${bounds[name].min} and ${bounds[name].max}${unit(name)}.`;
      }
    }
    if (typeof ctx.dl2_success !== "boolean") errors.dl2_success = "Choose whether the 2nd attempt was good.";
    if (inputs.includes("dl1_weight_kg")) {
      if (typeof ctx.dl1_success !== "boolean") errors.dl1_success = "Choose whether the 1st attempt was good.";
      // Rules of the sport (cleaning rule C10): the bar never gets lighter, and after a good lift it must get heavier.
      if (!errors.dl1_weight_kg && !errors.dl2_weight_kg && hasValue(ctx.dl1_weight_kg) && hasValue(ctx.dl2_weight_kg)) {
        if (ctx.dl1_weight_kg > ctx.dl2_weight_kg) errors.dl1_weight_kg = "The 1st attempt cannot be heavier than the 2nd.";
        else if (ctx.dl1_success === true && ctx.dl1_weight_kg === ctx.dl2_weight_kg) {
          errors.dl2_weight_kg = "After a good 1st attempt the 2nd must be heavier.";
        }
      }
    }
    if (!model.categories.equipment.includes(ctx.equipment)) errors.equipment = "Choose an equipment category.";
    if (!model.categories.age_class_group.includes(ctx.age_class_group)) errors.age_class_group = "Choose an age group.";
    if (Object.keys(errors).length) return { errors, notes };

    for (const name of inputs) {
      const t = model.input_typical[name];
      if (!t || !hasValue(ctx[name])) continue;
      if (ctx[name] < t.p01 || ctx[name] > t.p99) {
        notes.push(`${LABELS[name]} (${fmtValue(name, ctx[name])}) is outside the usual range of ${t.p01}–${t.p99}${unit(name)}.`);
      }
    }
    const x = features(model, ctx, ctx.dl2_weight_kg);
    for (const [name, t] of Object.entries(model.profile_typical)) {
      if (name === "pb_gap" && !x.has_prev_best) continue;
      if (x[name] < t.p01 || x[name] > t.p99) notes.push(`${LABELS[name]} is unusual for the training data.`);
    }
    return { errors, notes };
  }

  /** Allowed 3rd-attempt weights: heavier after a good 2nd (a miss may be repeated), at most +max_jump_pct. */
  function candidateWeights(model, ctx, stepKg) {
    const dl2 = ctx.dl2_weight_kg;
    const maxKg = dl2 * (1 + model.max_jump_pct / 100);
    const eps = 1e-9;
    const weights = [];
    if (!ctx.dl2_success) weights.push(dl2);
    let w = (Math.floor(dl2 / stepKg + eps) + 1) * stepKg;
    for (; w <= maxKg + eps; w += stepKg) weights.push(Math.round(w * 100) / 100);
    return weights;
  }

  /** Why a declared weight cannot be evaluated, or null if it can. */
  function plannedWeightError(model, ctx, plannedKg) {
    if (!hasValue(plannedKg) || !Number.isFinite(plannedKg)) return "Enter the declared weight in kg.";
    const dl2 = ctx.dl2_weight_kg;
    if (plannedKg < dl2) return `The 3rd attempt cannot be lighter than the 2nd (${fmtKg(dl2)}).`;
    if (ctx.dl2_success && plannedKg <= dl2) return `After a good 2nd attempt the 3rd must be heavier than ${fmtKg(dl2)}.`;
    if (plannedKg > dl2 * (1 + model.max_jump_pct / 100) + 1e-9) {
      return `Jumps above ${model.max_jump_pct} % are outside the data the model has seen.`;
    }
    return null;
  }

  /**
   * Evaluate all candidate weights and pick the heaviest one within the risk limit.
   * options.mode "extra": limit = risk of the smallest allowed jump + options.limit (e.g. 0.05)
   * options.mode "absolute": limit = options.limit (e.g. 0.35)
   */
  function evaluate(model, ctx, options) {
    const { stepKg = 2.5, mode = "extra", limit = 0.05 } = options || {};
    const weights = candidateWeights(model, ctx, stepKg);
    const risks = weights.map((w) => predict(model, ctx, w));
    const floorRisk = risks[0];
    const limitRisk = mode === "absolute" ? limit : floorRisk + limit;
    const band = model.uncertainty_band;
    const candidates = weights.map((w, i) => ({
      weight_kg: w,
      jump_pct: ((w - ctx.dl2_weight_kg) / ctx.dl2_weight_kg) * 100,
      p_fail: risks[i],
      within_limit: risks[i] <= limitRisk + 1e-12,
      warning: risks[i] > limitRisk + 1e-12,
      uncertain: Math.abs(risks[i] - limitRisk) < band,
    }));
    let suggestion = null;
    for (const c of candidates) if (c.within_limit) suggestion = c; // risks never decrease, so the last one wins
    return { candidates, suggestion, smallest: candidates[0], limit_risk: limitRisk, mode, step_kg: stepKg };
  }

  /** IPF plate loading per side for a total bar weight (20 kg bar + 2.5 kg collars). */
  function plateLoading(totalKg) {
    let perSide = (totalKg - BAR_AND_COLLARS_KG) / 2;
    if (perSide < -1e-9) return { plates: [], per_side_kg: 0, exact: false, below_bar: true };
    const plates = [];
    let rest = Math.round(perSide * 1000) / 1000;
    for (const plate of PLATES_KG) {
      while (rest + 1e-9 >= plate) {
        plates.push(plate);
        rest = Math.round((rest - plate) * 1000) / 1000;
      }
    }
    return { plates, per_side_kg: perSide, exact: rest < 1e-6, below_bar: false, remainder_kg: rest };
  }

  return { features, predict, validateContext, candidateWeights, plannedWeightError, evaluate, plateLoading, LABELS };
});

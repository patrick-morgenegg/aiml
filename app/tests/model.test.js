// Run from the repository root: node --test app/tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const M = require("../js/model.js");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(__dirname, ...p), "utf8"));
const model = read("..", "model", "model.json");          // v2, in use (notebook 04)
const reference = read("reference_cases.json");
const modelV1 = read("..", "model", "model_v1.json");     // v1 baseline (notebook 02)
const referenceV1 = read("reference_cases_v1.json");

const example = {
  dl1_weight_kg: 215, dl1_success: true, dl2_weight_kg: 230, dl2_success: true, bodyweight_kg: 82.5,
  age_class_group: "Open", equipment: "Raw", best_squat_kg: 210, best_bench_kg: 140, prev_best_deadlift_kg: 235,
  prev_meets_count: 3,
};

test("the app runs model v2 (gradient boosting)", () => {
  assert.equal(model.model_kind, "gbm");
  assert.ok(model.trees.length > 100 && model.features.some((f) => f.name === "jump12"));
});

test("model-data.js and model.json carry the same model", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "model", "model-data.js"), "utf8");
  const body = js.slice(js.indexOf("=") + 1).trim().replace(/;$/, "");
  assert.deepEqual(JSON.parse(body), model);
});

test("v2 reproduces the Python probabilities of notebook 04", () => {
  assert.equal(reference.model_version, model.model_version);
  assert.ok(reference.cases.length >= 20);
  for (const c of reference.cases) {
    const p = M.predict(model, c.context, c.planned_kg);
    assert.ok(Math.abs(p - c.p_fail) < 1e-9, `expected ${c.p_fail}, got ${p}`);
  }
});

test("v1 still reproduces the Python probabilities of notebook 02", () => {
  assert.equal(referenceV1.model_version, modelV1.model_version);
  for (const c of referenceV1.cases) {
    const p = M.predict(modelV1, c.context, c.planned_kg);
    assert.ok(Math.abs(p - c.p_fail) < 1e-9, `expected ${c.p_fail}, got ${p}`);
  }
});

test("risk never decreases when the planned weight increases", () => {
  for (const c of reference.cases.concat([{ context: example }, { context: { ...example, dl1_success: false, prev_best_deadlift_kg: null } }])) {
    const ctx = c.context;
    let previous = -1;
    for (let f = 1.0; f <= 1.25 + 1e-9; f += 0.005) {
      const p = M.predict(model, ctx, ctx.dl2_weight_kg * f);
      assert.ok(p >= previous - 1e-12, "risk went down");
      previous = p;
    }
  }
});

test("sex is neither a feature nor able to change a prediction", () => {
  assert.ok(!model.features.some((f) => /sex/i.test(f.name)));
  assert.ok(!Object.keys(M.features(model, example, 240)).some((n) => /sex/i.test(n)));
  const withSex = { ...example, sex: "F" };
  assert.equal(M.predict(model, withSex, 240), M.predict(model, example, 240));
  const out = JSON.stringify(M.evaluate(model, withSex, { stepKg: 2.5 }));
  assert.ok(!/sex/i.test(out));
});

test("candidate weights follow the attempt rules", () => {
  const good = M.candidateWeights(model, example, 2.5);
  assert.equal(good[0], 232.5);
  assert.ok(good.every((w) => w > 230 && w <= 230 * 1.25 + 1e-9 && Math.abs(w / 2.5 - Math.round(w / 2.5)) < 1e-9));
  const miss = M.candidateWeights(model, { ...example, dl2_success: false }, 2.5);
  assert.equal(miss[0], 230, "a missed 2nd attempt may be repeated");
  const odd = M.candidateWeights(model, { ...example, dl2_weight_kg: 221.35 }, 2.5);
  assert.equal(odd[0], 222.5);
  assert.equal(M.candidateWeights(model, example, 0.5)[0], 230.5);
});

test("suggestion is the heaviest candidate within the limit", () => {
  for (const [mode, limit] of [["extra", 0.05], ["extra", 0], ["absolute", 0.45], ["absolute", 0.6]]) {
    const r = M.evaluate(model, example, { stepKg: 2.5, mode, limit });
    const within = r.candidates.filter((c) => c.p_fail <= r.limit_risk + 1e-12);
    assert.deepEqual(r.suggestion, within[within.length - 1]);
    if (mode === "extra") assert.ok(Math.abs(r.limit_risk - (r.candidates[0].p_fail + limit)) < 1e-12);
  }
  const none = M.evaluate(model, example, { stepKg: 2.5, mode: "absolute", limit: 0.1 });
  assert.equal(none.suggestion, null);
  assert.ok(none.candidates.every((c) => c.warning));
});

test("uncertain marks candidates close to the limit", () => {
  const r = M.evaluate(model, example, { stepKg: 2.5, mode: "absolute", limit: 0.45 });
  for (const c of r.candidates) assert.equal(c.uncertain, Math.abs(c.p_fail - 0.45) < model.uncertainty_band);
});

test("input validation rejects out-of-range and missing values", () => {
  assert.deepEqual(M.validateContext(model, example).errors, {});
  const bad = M.validateContext(model, { ...example, bodyweight_kg: 400, best_squat_kg: null, equipment: "Straps" });
  assert.ok(bad.errors.bodyweight_kg && bad.errors.best_squat_kg && bad.errors.equipment);
  assert.ok(M.validateContext(model, { ...example, prev_best_deadlift_kg: null }).errors.prev_best_deadlift_kg === undefined);
  assert.ok(M.validateContext(model, { ...example, dl2_success: undefined }).errors.dl2_success);
});

test("1st attempt and earlier competitions are required and follow the attempt rules", () => {
  const errs = (ctx) => M.validateContext(model, ctx).errors;
  assert.ok(errs({ ...example, dl1_weight_kg: null }).dl1_weight_kg);
  assert.ok(errs({ ...example, dl1_success: undefined }).dl1_success);
  assert.ok(errs({ ...example, dl1_weight_kg: 240 }).dl1_weight_kg, "1st heavier than 2nd");
  assert.ok(errs({ ...example, dl1_weight_kg: 230 }).dl2_weight_kg, "good 1st, same weight again");
  assert.deepEqual(errs({ ...example, dl1_weight_kg: 230, dl1_success: false }), {}, "a missed 1st may be repeated");
  assert.ok(errs({ ...example, prev_meets_count: null }).prev_meets_count);
  assert.ok(errs({ ...example, prev_meets_count: 2.5 }).prev_meets_count);
  assert.ok(errs({ ...example, prev_meets_count: -1 }).prev_meets_count);
  assert.deepEqual(errs({ ...example, prev_meets_count: 0, prev_best_deadlift_kg: null }), {});
});

test("v2 uses the new inputs", () => {
  const base = M.predict(model, example, 245);
  assert.notEqual(M.predict(model, { ...example, dl1_success: false }, 245), base);
  assert.notEqual(M.predict(model, { ...example, prev_meets_count: 40 }, 245), base);
});

test("unusual but valid inputs produce notes, not errors", () => {
  const r = M.validateContext(model, { ...example, bodyweight_kg: 200, dl2_weight_kg: 120, dl1_weight_kg: 110 });
  assert.deepEqual(r.errors, {});
  assert.ok(r.notes.length >= 1);
});

test("declared weights below the 2nd attempt or beyond the jump cap are refused", () => {
  assert.ok(M.plannedWeightError(model, example, 225));
  assert.ok(M.plannedWeightError(model, example, 230));
  assert.equal(M.plannedWeightError(model, { ...example, dl2_success: false }, 230), null);
  assert.ok(M.plannedWeightError(model, example, 300));
  assert.equal(M.plannedWeightError(model, example, 245), null);
});

test("IPF plate loading", () => {
  const l = M.plateLoading(272.5);
  assert.deepEqual(l.plates, [25, 25, 25, 25, 20, 2.5, 1.25]);
  assert.ok(l.exact);
  assert.deepEqual(M.plateLoading(25).plates, []);
  assert.ok(M.plateLoading(20).below_bar);
  assert.ok(!M.plateLoading(100.3).exact);
});

test("predictions are deterministic", () => {
  const a = M.evaluate(model, example, { stepKg: 2.5 });
  const b = M.evaluate(model, example, { stepKg: 2.5 });
  assert.deepEqual(a, b);
});

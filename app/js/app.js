/* UI for the Third Attempt Planner. Prediction logic lives in model.js, the chart in chart.js. */
(function () {
  "use strict";

  const MODEL = window.DEADLIFT_MODEL;
  const M = window.DeadliftModel;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "third-attempt-planner.log.v1";
  const NUMERIC = ["dl2_weight_kg", "prev_best_deadlift_kg", "best_squat_kg", "best_bench_kg", "bodyweight_kg"];
  const PRESETS = { extra: [0.02, 0.05, 0.1], absolute: [0.3, 0.4, 0.5] };
  const SLIDER = { extra: { min: 0, max: 15, step: 0.5 }, absolute: { min: 15, max: 80, step: 1 } };
  const limits = { extra: 0.05, absolute: Math.round(MODEL.threshold * 100) / 100 };
  const touched = new Set();
  let current = null;
  let declaredDirty = false;
  let log = loadLog();

  const ICON = {
    ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.7H1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 9c2-3 4-3 6 0s4 3 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l2 4.3 4.6.5-3.4 3.1 1 4.6L8 11.7 3.8 14l1-4.6L1.4 6.3 6 5.8z" fill="currentColor"/></svg>',
  };

  const pct = (p) => `${Math.round(p * 100)} %`;
  const kgText = (w) => `${Number(Number(w).toFixed(2))}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const pill = (kind, icon, text) => `<span class="pill pill--${kind}">${ICON[icon] || ""}${esc(text)}</span>`;

  // ---------- form ----------
  function populateSelects() {
    const labels = { "Sub-Junior": "Sub-Junior (up to 18)", Junior: "Junior (19–23)", Open: "Open (24–39)", Masters: "Masters (40+)", Unknown: "Unknown" };
    $("equipment").innerHTML = MODEL.categories.equipment.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
    $("age_class_group").innerHTML = MODEL.categories.age_class_group
      .map((a) => `<option value="${esc(a)}">${esc(labels[a] || a)}</option>`).join("");
    $("equipment").value = "Raw";
    $("age_class_group").value = "Open";
  }

  function readContext() {
    const ctx = {};
    for (const name of NUMERIC) {
      const raw = $(name).value.trim();
      ctx[name] = raw === "" ? null : Number(raw);
    }
    const s = document.querySelector('input[name="dl2_success"]:checked');
    ctx.dl2_success = s ? s.value === "1" : undefined;
    ctx.equipment = $("equipment").value;
    ctx.age_class_group = $("age_class_group").value;
    return ctx;
  }

  function mode() { return document.querySelector('input[name="mode"]:checked').value; }

  function syncSlider() {
    const m = mode(), cfg = SLIDER[m], slider = $("limit");
    slider.min = cfg.min; slider.max = cfg.max; slider.step = cfg.step;
    slider.value = String(Math.round(limits[m] * 1000) / 10);
    $("limit-label").textContent = m === "extra" ? "Accept extra failure risk up to" : "Accept failure risk up to";
    $("limit-out").textContent = m === "extra" ? `+${Number(slider.value)} points` : `${Number(slider.value)} %`;
    document.querySelectorAll("#presets button").forEach((b, i) => {
      b.setAttribute("aria-pressed", String(Math.abs(PRESETS[m][i] - limits[m]) < 1e-9));
      b.title = m === "extra" ? `+${PRESETS[m][i] * 100} points` : `${PRESETS[m][i] * 100} %`;
    });
  }

  function showFieldErrors(errors) {
    for (const name of [...NUMERIC, "dl2_success", "equipment", "age_class_group"]) {
      const msg = touched.has(name) || touched.has("*") ? errors[name] || "" : "";
      $("err-" + name).textContent = msg;
      const field = $("err-" + name).closest(".field");
      if (field) field.classList.toggle("has-error", Boolean(msg));
    }
  }

  // ---------- planner ----------
  function statusOf(c) {
    if (c.uncertain) return { kind: "neutral", icon: "close", text: "Close to limit" };
    if (c.within_limit) return { kind: "ok", icon: "ok", text: "Within limit" };
    return { kind: "warn", icon: "warn", text: "Above limit" };
  }

  function update() {
    const ctx = readContext();
    const { errors, notes } = M.validateContext(MODEL, ctx);
    showFieldErrors(errors);
    if (Object.keys(errors).length) {
      current = null;
      renderEmpty(Object.keys(errors).length && touched.size ? "Complete the highlighted fields to see the risk." : "Enter the athlete's numbers to see the risk.");
      renderDeclaredPreview();
      return;
    }
    const result = M.evaluate(MODEL, ctx, { stepKg: Number($("step").value), mode: mode(), limit: limits[mode()] });
    current = { ctx, result };
    renderVerdict(ctx, result);
    renderNotes(notes);
    window.RiskChart.render($("chart"), result, { bandWidth: MODEL.uncertainty_band, statusText: (c) => statusOf(c).text });
    renderLegend();
    renderTable(result);
    if (!declaredDirty) $("declared_kg").value = result.suggestion ? kgText(result.suggestion.weight_kg) : "";
    renderDeclaredPreview();
  }

  function renderEmpty(message) {
    $("verdict").classList.add("is-error");
    $("verdict-eyebrow").textContent = "Suggested 3rd attempt";
    $("verdict-kg").textContent = "–";
    $("verdict-meta").innerHTML = "";
    $("verdict-explain").textContent = message;
    $("loading").hidden = true;
    $("input-notes").innerHTML = "";
    $("chart").innerHTML = '<p class="empty">The risk curve appears once all required fields are valid.</p>';
    $("chart-legend").innerHTML = "";
    document.querySelector("#candidates tbody").innerHTML = "";
    $("table-caption").textContent = "";
  }

  function renderVerdict(ctx, result) {
    const v = $("verdict");
    v.classList.remove("is-error");
    const s = result.suggestion;
    const shown = s || result.smallest;
    $("verdict-eyebrow").textContent = s ? "Suggested 3rd attempt" : "No weight within your limit";
    $("verdict-kg").textContent = kgText(shown.weight_kg);
    const status = s ? pill("ok", "star", "Within your limit") : pill("warn", "warn", "Above your limit");
    $("verdict-meta").innerHTML = `${status}<span>+${shown.jump_pct.toFixed(1)} % on the 2nd · ${pct(shown.p_fail)} failure risk</span>`;

    const sm = result.smallest;
    let text;
    if (!s) {
      text = `Even the smallest allowed jump, ${kgText(sm.weight_kg)} kg, has ${pct(sm.p_fail)} predicted failure risk. ` +
        "Raise the limit, or treat this as a warning that today's 3rd attempt is a long shot.";
    } else if (result.mode === "extra") {
      text = `Heaviest weight whose risk stays within ${Math.round(limits.extra * 1000) / 10} points of the smallest ` +
        `allowed jump (${kgText(sm.weight_kg)} kg at ${pct(sm.p_fail)}). The model expects about ` +
        `${Math.round((1 - s.p_fail) * 100)} % of comparable attempts at this weight to be good lifts.`;
    } else {
      text = `Heaviest weight with at most ${pct(limits.absolute)} predicted failure risk. The model expects about ` +
        `${Math.round((1 - s.p_fail) * 100)} % of comparable attempts at this weight to be good lifts.`;
    }
    const last = result.candidates[result.candidates.length - 1];
    if (s && s === last) text += ` This is the ${MODEL.max_jump_pct} % jump cap; the model has no data on bigger jumps.`;
    $("verdict-explain").textContent = text;
    renderLoading(shown.weight_kg);
  }

  function renderLoading(totalKg) {
    const loading = M.plateLoading(totalKg);
    const box = $("loading");
    box.hidden = false;
    const svg = $("loading-svg");
    const H = 64, mid = H / 2;
    const size = { 25: [14, 60], 20: [12, 60], 15: [11, 53], 10: [9, 44], 5: [7, 32], 2.5: [6, 26], 1.25: [5, 22], 0.5: [4, 18], 0.25: [4, 16] };
    const cls = (p) => (p >= 5 ? `plate-${p}` : p === 2.5 ? "plate-2_5" : "plate-small");
    let x = 18;
    let parts = `<rect class="sleeve" x="0" y="${mid - 3}" width="200" height="6" rx="2"/>` +
      `<rect class="collar" x="8" y="${mid - 9}" width="8" height="18" rx="2"/>`;
    for (const p of loading.plates) {
      const [w, h] = size[p];
      parts += `<rect class="plate ${cls(p)}" x="${x}" y="${mid - h / 2}" width="${w}" height="${h}" rx="2"/>`;
      x += w + 1.5;
    }
    if (!loading.below_bar) parts += `<rect class="collar" x="${x + 1}" y="${mid - 8}" width="7" height="16" rx="2"/>`;
    svg.setAttribute("viewBox", `0 0 210 ${H}`);
    svg.innerHTML = parts;

    let text;
    if (loading.below_bar) text = "Lighter than the bar with collars (25 kg).";
    else if (!loading.plates.length) text = "<strong>Empty bar</strong> with collars.";
    else text = `<strong>Per side: ${loading.plates.map(kgText).join(" · ")}</strong><br>20 kg bar + 2 × 2.5 kg collars (IPF plates)`;
    if (!loading.below_bar && !loading.exact) text += `<br>Not exactly loadable with IPF plates (${kgText(loading.remainder_kg)} kg per side left over).`;
    $("loading-text").innerHTML = text;
  }

  function renderNotes(notes) {
    $("input-notes").innerHTML = notes.map((n) => `<li>${ICON.warn}<span>${esc(n)} The prediction is less reliable.</span></li>`).join("");
  }

  function renderLegend() {
    $("chart-legend").innerHTML = '<span><i></i>Failure risk</span><span><i class="dash"></i>Your limit</span>' +
      `<span><i class="band"></i>±${Math.round(MODEL.uncertainty_band * 100)} points: close to the limit</span>`;
  }

  function renderTable(result) {
    const rows = result.candidates.map((c) => {
      const st = statusOf(c);
      const suggested = result.suggestion === c;
      return `<tr class="${suggested ? "is-suggested" : ""}">` +
        `<td>${kgText(c.weight_kg)}</td>` +
        `<td class="num">+${c.jump_pct.toFixed(1)} %</td>` +
        `<td class="num">${pct(c.p_fail)}<span class="riskbar" aria-hidden="true"><span style="width:${(c.p_fail * 100).toFixed(1)}%"></span></span></td>` +
        `<td>${pill(st.kind, st.icon, st.text)}${suggested ? " " + pill("neutral", "star", "Suggested") : ""}</td></tr>`;
    });
    document.querySelector("#candidates tbody").innerHTML = rows.join("");
    $("table-caption").textContent = `${result.candidates.length} weights in ${result.step_kg} kg steps, up to +${MODEL.max_jump_pct} %`;
  }

  // ---------- decision log ----------
  function loadLog() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveLog() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)); return true; } catch (e) { return false; }
  }

  function declaredValue() {
    const raw = $("declared_kg").value.trim();
    return raw === "" ? null : Number(raw);
  }

  function renderDeclaredPreview() {
    const out = $("declared-preview");
    $("err-declared_kg").textContent = "";
    if (!current) { out.textContent = "Complete the planner first."; return; }
    const w = declaredValue();
    if (w === null) { out.textContent = "Enter the weight that was handed to the table."; return; }
    const err = M.plannedWeightError(MODEL, current.ctx, w);
    if (err) { out.textContent = err; return; }
    const p = M.predict(MODEL, current.ctx, w);
    const over = p > current.result.limit_risk + 1e-12;
    out.innerHTML = `Risk at ${kgText(w)} kg: <strong>${pct(p)}</strong> · ` +
      (over ? pill("warn", "warn", "Above your limit: logged as override") : pill("ok", "ok", "Within your limit"));
  }

  function logDecision(evt) {
    evt.preventDefault();
    if (!current) { $("err-declared_kg").textContent = "Complete the planner first."; return; }
    const w = declaredValue();
    const err = w === null ? "Enter the declared weight in kg." : M.plannedWeightError(MODEL, current.ctx, w);
    if (err) { $("err-declared_kg").textContent = err; return; }
    const { ctx, result } = current;
    const p = M.predict(MODEL, ctx, w);
    log.unshift({
      logged_at: new Date().toISOString(),
      dl2_weight_kg: ctx.dl2_weight_kg, dl2_success: ctx.dl2_success, bodyweight_kg: ctx.bodyweight_kg,
      best_squat_kg: ctx.best_squat_kg, best_bench_kg: ctx.best_bench_kg, prev_best_deadlift_kg: ctx.prev_best_deadlift_kg,
      equipment: ctx.equipment, age_class_group: ctx.age_class_group,
      limit_mode: result.mode, limit_setting: limits[result.mode], limit_risk: round4(result.limit_risk),
      suggested_kg: result.suggestion ? result.suggestion.weight_kg : null,
      declared_kg: w, p_fail_declared: round4(p), override: p > result.limit_risk + 1e-12,
      outcome: "pending", model_version: MODEL.model_version,
    });
    const stored = saveLog();
    renderLog(stored ? "Decision logged." : "Decision logged for this session only – this browser does not allow storage.");
  }
  const round4 = (x) => Math.round(x * 10000) / 10000;

  function renderLog(status) {
    const body = document.querySelector("#log-table tbody");
    body.innerHTML = log.map((e, i) => {
      const when = new Date(e.logged_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
      const declared = `${kgText(e.declared_kg)}${e.override ? " " + pill("warn", "warn", "Override") : ""}`;
      const btn = (value, cls, label) =>
        `<button type="button" class="${cls}" data-i="${i}" data-outcome="${value}" aria-pressed="${e.outcome === value}">${label}</button>`;
      return `<tr><td>${esc(when)}</td><td>${kgText(e.dl2_weight_kg)} ${e.dl2_success ? "good" : "miss"}</td>` +
        `<td>${e.suggested_kg === null ? "–" : kgText(e.suggested_kg)}</td><td>${declared}</td><td class="num">${pct(e.p_fail_declared)}</td>` +
        `<td><span class="outcome">${btn("good", "good", "Good lift")}${btn("no_lift", "miss", "No lift")}</span></td></tr>`;
    }).join("");
    $("log-empty").hidden = log.length > 0;
    $("log-table").hidden = log.length === 0;
    if (status !== undefined) $("log-status").textContent = status;
  }

  function toCsv() {
    const cols = ["logged_at", "dl2_weight_kg", "dl2_success", "bodyweight_kg", "best_squat_kg", "best_bench_kg",
      "prev_best_deadlift_kg", "equipment", "age_class_group", "limit_mode", "limit_setting", "limit_risk",
      "suggested_kg", "declared_kg", "p_fail_declared", "override", "outcome", "model_version"];
    const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [cols.join(","), ...log.slice().reverse().map((e) => cols.map((c) => cell(e[c])).join(","))].join("\n");
  }

  function copyCsv() {
    const csv = toCsv();
    const fallback = () => {
      const ta = $("csv-fallback");
      ta.hidden = false; ta.value = csv; ta.focus(); ta.select();
      $("log-status").textContent = "Copying is blocked here. The CSV is selected below – copy it with Ctrl+C or ⌘C.";
    };
    if (!log.length) { $("log-status").textContent = "The log is empty."; return; }
    if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
    navigator.clipboard.writeText(csv)
      .then(() => { $("csv-fallback").hidden = true; $("log-status").textContent = `Copied ${log.length} decisions as CSV.`; })
      .catch(fallback);
  }

  let clearArmed = null;
  function clearLog() {
    const btn = $("clear-log");
    if (!log.length) { $("log-status").textContent = "The log is already empty."; return; }
    if (!clearArmed) {
      btn.textContent = "Click again to delete all";
      btn.classList.add("button--danger");
      clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = "Clear log"; btn.classList.remove("button--danger"); }, 4000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = null;
    btn.textContent = "Clear log"; btn.classList.remove("button--danger");
    log = []; saveLog(); $("csv-fallback").hidden = true;
    renderLog("Log cleared.");
  }

  // ---------- model & data ----------
  function renderModelCard() {
    const d = MODEL.dataset, v = MODEL.metrics.validation, t = MODEL.metrics.test;
    const n = (x) => Number(x).toLocaleString("en-US");
    const f2 = (x) => (x === null || x === undefined ? "–" : Number(x).toFixed(2));
    $("model-lede").textContent = `Logistic regression trained on ${n(d.train_records)} third deadlift attempts by ` +
      `${n(d.train_athletes)} athletes (OpenPowerlifting, ${d.period}, snapshot ${d.snapshot_date}). ` +
      "Its predicted risk can only rise when the declared weight rises.";
    $("metrics-note").textContent = `Validation split: ${n(v.n)} attempts, ${pct(v.base_rate)} of them failed. ` +
      `Warning at ${pct(v.threshold)} or more: the model catches ${pct(v.recall)} of failed attempts, and ` +
      `${pct(v.precision)} of its warnings are failed attempts. ` +
      (t ? `Test split (${n(t.n)} attempts): precision ${f2(t.precision)}, recall ${f2(t.recall)}, PR-AUC ${f2(t.pr_auc)}.`
         : "The test split is kept for the final evaluation and has not been used yet.");
    const rows = Object.entries(MODEL.baselines_validation).map(([name, m]) =>
      `<tr class="${name.startsWith("Model") ? "is-model" : ""}"><td>${esc(name)}</td><td class="num">${f2(m.precision)}</td>` +
      `<td class="num">${f2(m.recall)}</td><td class="num">${f2(m.pr_auc)}</td></tr>`);
    $("metrics-table").innerHTML = '<thead><tr><th scope="col">Approach</th><th class="num" scope="col">Precision</th>' +
      `<th class="num" scope="col">Recall</th><th class="num" scope="col">PR-AUC</th></tr></thead><tbody>${rows.join("")}</tbody>`;

    $("calibration-table").innerHTML = '<thead><tr><th class="num" scope="col">Predicted</th><th class="num" scope="col">Observed</th>' +
      `<th class="num" scope="col">Attempts</th></tr></thead><tbody>${MODEL.calibration_validation.map((r) =>
        `<tr><td class="num">${pct(r.predicted)}</td><td class="num">${pct(r.observed)}</td><td class="num">${n(r.n)}</td></tr>`).join("")}</tbody>`;

    const segName = { sex: "Sex", age_class_group: "Age group", equipment: "Equipment" };
    const valName = { M: "Men", F: "Women" };
    $("segments-note").textContent = `Precision and recall at the ${pct(v.threshold)} warning threshold, validation split. ` +
      "Sex is used only for this check and is never an input. \"Too small\": fewer than 100 failed attempts. " +
      "\"Check\": recall differs from the overall value by more than 10 points.";
    $("segments-table").innerHTML = '<thead><tr><th scope="col">Group</th><th scope="col">Segment</th><th class="num" scope="col">Attempts</th>' +
      '<th class="num" scope="col">Failed</th><th class="num" scope="col">Precision</th><th class="num" scope="col">Recall</th>' +
      `<th scope="col">Note</th></tr></thead><tbody>${MODEL.segments_validation.map((r) =>
        `<tr><td>${esc(segName[r.segment] || r.segment)}</td><td>${esc(valName[r.value] || r.value)}</td><td class="num">${n(r.n)}</td>` +
        `<td class="num">${n(r.failed)}</td><td class="num">${f2(r.precision)}</td><td class="num">${f2(r.recall)}</td>` +
        `<td>${r.flag === "too small" ? pill("neutral", "close", "Too small") : r.flag === "check" ? pill("warn", "warn", `Check (${r.recall_gap_pp > 0 ? "+" : ""}${r.recall_gap_pp} pts)`) : ""}</td></tr>`).join("")}</tbody>`;

    $("limitations").innerHTML = MODEL.limitations.map((l) => `<li>${esc(l)}</li>`).join("");
    $("data-facts").textContent = `Model ${MODEL.model_version}, trained ${MODEL.created_utc.slice(0, 10)} · dataset schema ` +
      `${d.schema_version} · OpenPowerlifting commit ${d.opl_commit}.`;
    $("attribution").innerHTML = 'This project uses data from the OpenPowerlifting project, ' +
      '<a href="https://www.openpowerlifting.org" target="_blank" rel="noopener">https://www.openpowerlifting.org</a>.';
  }

  // ---------- wiring ----------
  function init() {
    populateSelects();
    syncSlider();
    renderModelCard();
    renderLog();

    $("context-form").addEventListener("input", (e) => {
      if (e.target.name && e.target.name !== "limit" && e.target.name !== "mode" && e.target.name !== "step") {
        touched.add(e.target.name);
        $("example-note").hidden = true;
      }
      if (e.target.id === "limit") {
        limits[mode()] = Number(e.target.value) / 100;
        syncSlider();
      }
      update();
    });
    $("context-form").addEventListener("change", (e) => {
      if (e.target.name === "mode") syncSlider();
      update();
    });
    $("context-form").addEventListener("submit", (e) => { e.preventDefault(); touched.add("*"); update(); });
    $("presets").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-preset]");
      if (!b) return;
      limits[mode()] = PRESETS[mode()][Number(b.dataset.preset)];
      syncSlider();
      update();
    });
    $("clear-form").addEventListener("click", () => {
      for (const name of NUMERIC) $(name).value = "";
      touched.clear();
      $("example-note").hidden = true;
      declaredDirty = false;
      update();
      $("dl2_weight_kg").focus();
    });
    for (const name of NUMERIC) $(name).addEventListener("blur", () => { touched.add(name); update(); });

    $("declared_kg").addEventListener("input", () => { declaredDirty = true; renderDeclaredPreview(); });
    $("log-form").addEventListener("submit", logDecision);
    $("copy-csv").addEventListener("click", copyCsv);
    $("clear-log").addEventListener("click", clearLog);
    $("log-table").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-outcome]");
      if (!b) return;
      const entry = log[Number(b.dataset.i)];
      entry.outcome = entry.outcome === b.dataset.outcome ? "pending" : b.dataset.outcome;
      saveLog();
      renderLog();
    });

    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (current) window.RiskChart.render($("chart"), current.result, { bandWidth: MODEL.uncertainty_band, statusText: (c) => statusOf(c).text });
      });
    };
    if ("ResizeObserver" in window) new ResizeObserver(redraw).observe($("chart"));
    else window.addEventListener("resize", redraw);

    update();
  }

  if (!MODEL || !M || !window.RiskChart) {
    document.body.insertAdjacentHTML("afterbegin", '<p class="wrap" style="padding-block:16px">The model files are missing. ' +
      "Open the app from the <code>app/</code> folder with all its files, or regenerate them with notebook 02.</p>");
    return;
  }
  if (String(MODEL.dataset.schema_version).split(".")[0] !== "1") {
    document.body.insertAdjacentHTML("afterbegin", '<p class="wrap">This app expects a model built on dataset schema 1.x.</p>');
    return;
  }
  init();
})();

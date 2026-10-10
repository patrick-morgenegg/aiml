/*
 * Risk curve: failure risk (y, from 0) against declared weight (x). One series, the risk limit as a dashed
 * reference line with its "close to the limit" band, the suggested weight emphasised. Hover, touch and arrow
 * keys move a crosshair with a tooltip; the attempt table below is the accessible data view.
 */
(function (root) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const HEIGHT = 280;
  const M = { top: 18, right: 18, bottom: 40, left: 46 };

  const pct = (p) => `${Math.round(p * 100)} %`;
  const kg = (w) => `${Number(w.toFixed(2))} kg`;

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceStep(range, maxTicks) {
    for (const step of [0.5, 1, 2.5, 5, 10, 20, 25, 50, 100]) if (range / step <= maxTicks) return step;
    return 100;
  }

  function render(container, result, options) {
    const opts = Object.assign({ bandWidth: 0.02, statusText: () => "" }, options);
    container.textContent = "";
    const width = Math.max(280, container.clientWidth || 600);
    const svg = el("svg", { viewBox: `0 0 ${width} ${HEIGHT}`, role: "group",
      "aria-label": `Failure risk from ${pct(result.candidates[0].p_fail)} at ${kg(result.candidates[0].weight_kg)} to ` +
        `${pct(result.candidates[result.candidates.length - 1].p_fail)} at ` +
        `${kg(result.candidates[result.candidates.length - 1].weight_kg)}` }, container);

    const c = result.candidates;
    const x0 = c[0].weight_kg, x1 = c[c.length - 1].weight_kg;
    const maxP = Math.max(...c.map((d) => d.p_fail), result.limit_risk);
    const yMax = Math.min(1, Math.max(0.6, Math.ceil((maxP + 0.05) * 10) / 10));
    const iw = width - M.left - M.right, ih = HEIGHT - M.top - M.bottom;
    const sx = (w) => M.left + (x1 === x0 ? iw / 2 : ((w - x0) / (x1 - x0)) * iw);
    const sy = (p) => M.top + ih - (p / yMax) * ih;

    // grid + y ticks
    const yStep = yMax <= 0.6 ? 0.1 : 0.2;
    for (let t = 0; t <= yMax + 1e-9; t += yStep) {
      el("line", { x1: M.left, x2: width - M.right, y1: sy(t), y2: sy(t), class: t === 0 ? "c-axis" : "c-grid" }, svg);
      el("text", { x: M.left - 8, y: sy(t) + 4, "text-anchor": "end", class: "c-tick" }, svg).textContent = pct(t);
    }
    // x ticks
    const xStep = niceStep(Math.max(x1 - x0, 1), Math.max(3, Math.floor(iw / 70)));
    for (let t = Math.ceil(x0 / xStep - 1e-9) * xStep; t <= x1 + 1e-9; t += xStep) {
      el("line", { x1: sx(t), x2: sx(t), y1: M.top + ih, y2: M.top + ih + 5, class: "c-axis" }, svg);
      el("text", { x: sx(t), y: M.top + ih + 19, "text-anchor": "middle", class: "c-tick" }, svg).textContent = `${Number(t.toFixed(2))}`;
    }
    el("text", { x: M.left + iw / 2, y: HEIGHT - 4, "text-anchor": "middle", class: "c-title" }, svg).textContent = "Declared weight (kg)";

    // limit band and line
    const lim = result.limit_risk;
    if (lim <= yMax) {
      const top = sy(Math.min(yMax, lim + opts.bandWidth)), bottom = sy(Math.max(0, lim - opts.bandWidth));
      el("rect", { x: M.left, y: top, width: iw, height: Math.max(0, bottom - top), class: "c-band" }, svg);
      el("line", { x1: M.left, x2: width - M.right, y1: sy(lim), y2: sy(lim), class: "c-limit" }, svg);
      el("text", { x: M.left + 6, y: sy(lim) - 7, class: "c-limit-label" }, svg).textContent = `Your limit ${pct(lim)}`;
    }

    // area under the curve + the curve
    const pts = c.map((d) => `${sx(d.weight_kg).toFixed(2)},${sy(d.p_fail).toFixed(2)}`);
    el("path", { d: `M${sx(x0)},${sy(0)} L${pts.join(" L")} L${sx(x1)},${sy(0)} Z`, class: "c-area" }, svg);
    el("path", { d: `M${pts.join(" L")}`, class: "c-line" }, svg);

    // smallest allowed jump and the suggestion
    el("circle", { cx: sx(x0), cy: sy(c[0].p_fail), r: 4.5, class: "c-dot--first" }, svg);
    const s = result.suggestion;
    if (s) {
      const cx = sx(s.weight_kg), cy = sy(s.p_fail);
      el("circle", { cx, cy, r: 6.5, class: "c-dot" }, svg);
      const label = el("text", { x: cx, y: cy + 22, class: "c-label" }, svg);
      label.textContent = `Suggested ${kg(s.weight_kg)} · ${pct(s.p_fail)}`;
      const anchorRight = cx > M.left + iw * 0.7;
      label.setAttribute("text-anchor", anchorRight ? "end" : cx < M.left + iw * 0.25 ? "start" : "middle");
    }

    // hover layer
    const cross = el("line", { y1: M.top, y2: M.top + ih, class: "c-cross", visibility: "hidden" }, svg);
    const hoverDot = el("circle", { r: 5, class: "c-hover-dot", visibility: "hidden" }, svg);
    const overlay = el("rect", { x: M.left, y: M.top, width: iw, height: ih, class: "c-overlay", tabindex: "0",
      "aria-label": "Risk curve. Use the left and right arrow keys to read values." }, svg);
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    container.appendChild(tip);

    let index = -1;
    function show(i) {
      index = Math.max(0, Math.min(c.length - 1, i));
      const d = c[index], cx = sx(d.weight_kg), cy = sy(d.p_fail);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      hoverDot.setAttribute("cx", cx); hoverDot.setAttribute("cy", cy); hoverDot.setAttribute("visibility", "visible");
      tip.innerHTML = `<strong>${kg(d.weight_kg)}</strong> · +${d.jump_pct.toFixed(1)} %<br>` +
        `Failure risk ${pct(d.p_fail)} · ${opts.statusText(d)}`;
      tip.hidden = false;
      const scale = container.clientWidth / width;
      const left = Math.min(Math.max(cx * scale, 90), container.clientWidth - 90);
      tip.style.left = `${left}px`;
      tip.style.top = `${cy * scale}px`;
    }
    function hide() {
      cross.setAttribute("visibility", "hidden"); hoverDot.setAttribute("visibility", "hidden"); tip.hidden = true;
    }
    function nearest(evt) {
      const box = svg.getBoundingClientRect();
      const x = ((evt.clientX - box.left) / box.width) * width;
      let best = 0;
      for (let i = 1; i < c.length; i++) if (Math.abs(sx(c[i].weight_kg) - x) < Math.abs(sx(c[best].weight_kg) - x)) best = i;
      return best;
    }
    overlay.addEventListener("pointermove", (e) => show(nearest(e)));
    overlay.addEventListener("pointerdown", (e) => show(nearest(e)));
    overlay.addEventListener("pointerleave", hide);
    overlay.addEventListener("blur", hide);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        show(index < 0 ? (s ? c.indexOf(s) : 0) : index + (e.key === "ArrowRight" ? 1 : -1));
      } else if (e.key === "Escape") hide();
    });
  }

  root.RiskChart = { render };
})(typeof self !== "undefined" ? self : this);

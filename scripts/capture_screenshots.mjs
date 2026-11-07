// Captures the README screenshots of the Third Attempt Planner (app/) into docs/screenshots/.
// Uses the example values the app ships with, so no athlete data appears in the images.
//
//   npm install --no-save playwright@1.51.1 && npx playwright install chromium
//   node scripts/capture_screenshots.mjs [repo-root] [out-dir]
//
// Rerun it after a visible change to the app and commit the new PNGs.
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] ?? path.join(here, ".."));
const out = path.resolve(process.argv[3] ?? path.join(repo, "docs", "screenshots"));
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(repo, "app", "index.html")).href;
const browser = await chromium.launch();

async function open(opts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, locale: "en-GB", timezoneId: "Europe/Zurich", ...opts });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector("#chart svg");
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function shootEl(page, selector, file, pad = 0) {
  const box = await page.locator(selector).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
  await page.screenshot({
    path: path.join(out, file),
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad },
    fullPage: true,
  });
}

// 1+2. Planner, light and dark: masthead + planner section at desktop width
for (const scheme of ["light", "dark"]) {
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const plannerBottom = await page.locator("#planner").evaluate((e) => e.getBoundingClientRect().bottom + window.scrollY);
  await page.screenshot({ path: path.join(out, `planner-${scheme}.png`), clip: { x: 0, y: 0, width: 1280, height: Math.ceil(plannerBottom + 24) }, fullPage: true });

  // 3. Chart with the hover tooltip above the limit
  if (scheme === "light") {
    const overlay = page.locator(".c-overlay");
    const b = await overlay.boundingBox();
    await page.mouse.move(b.x + b.width * 0.42, b.y + b.height * 0.5);
    await page.waitForTimeout(200);
    await shootEl(page, "#chart", "risk-chart.png", 12);
  }
  await ctx.close();
}

// 4. Decision log with three entries, two with outcomes
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  const decide = async (kg) => {
    await page.fill("#declared_kg", String(kg));
    await page.click("#log-form button[type=submit]");
  };
  await decide(240);
  await page.fill("#dl2_weight_kg", "250");
  await page.fill("#prev_best_deadlift_kg", "255");
  await page.locator("#dl2_weight_kg").blur();
  await decide(262.5);
  await page.click("label[for=dl2-miss]");
  await page.fill("#dl2_weight_kg", "200");
  await page.fill("#prev_best_deadlift_kg", "205");
  await page.locator("#dl2_weight_kg").blur();
  await decide(200);
  await page.click('#log-table tbody tr:nth-child(3) button[data-outcome="good"]');
  await page.click('#log-table tbody tr:nth-child(2) button[data-outcome="no_lift"]');
  await page.fill("#declared_kg", "");
  await page.locator("#log-status").evaluate((e) => (e.textContent = ""));
  await shootEl(page, "#log", "decision-log.png", 16);
  await ctx.close();
}

// 5. Model & data card
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await shootEl(page, "#model", "model-card.png", 16);
  await ctx.close();
}

// 6. Phone width: suggestion card and risk chart
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const r = await page.evaluate(() => {
    const a = document.querySelector("#verdict").closest(".card, .verdict").getBoundingClientRect();
    const b = document.querySelector("#chart").closest("figure, .card").getBoundingClientRect();
    return { y: a.top + window.scrollY, bottom: b.bottom + window.scrollY };
  });
  await page.screenshot({ path: path.join(out, "planner-mobile.png"), clip: { x: 0, y: r.y - 16, width: 390, height: r.bottom - r.y + 32 }, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(fs.readdirSync(out).map((f) => `${f}\t${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)} KB`).join("\n"));

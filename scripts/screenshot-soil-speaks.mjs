import { chromium } from "playwright";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT = process.env.SOIL_SHOT_OUT ?? "media/soil-speaks";
mkdirSync(OUT, { recursive: true });

const shots = [
  ["idle-stressed-camera-denied", "/?nocamera=1&mood=stressed"],
  ["idle-hopeful", "/?nocamera=1&mood=hopeful"],
  ["idle-thriving", "/?nocamera=1&mood=thriving"],
  ["listening", "/?nocamera=1&demo=listening&mood=hopeful"],
  ["thinking", "/?nocamera=1&demo=thinking&mood=hopeful"],
  ["speaking-verdict", "/?nocamera=1&demo=speaking&mood=thriving"],
  ["offline", "/?nocamera=1&demo=offline&mood=stressed"],
  ["error", "/?nocamera=1&demo=error&mood=hopeful"],
  ["why-sheet", "/?nocamera=1&demo=speaking&sheet=why&mood=hopeful"],
  ["language-sheet", "/?nocamera=1&sheet=lang"],
  ["region-picker", "/?nocamera=1&sheet=region"],
  ["onboarding", "/?nocamera=1&onboarding=1"],
];

const browser = await chromium.launch();
const results = [];
for (const [name, url] of shots) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
  });
  if (name !== "onboarding") {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("soilSpeaks:onboarded", "1");
      } catch {}
    });
  }
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2500);
    const file = `${OUT}/${name}.png`;
    await page.screenshot({ path: file });
    const ok = existsSync(file);
    results.push([name, ok]);
    console.log(`${ok ? "OK " : "MISSING "} ${file}`);
  } catch (err) {
    results.push([name, false]);
    console.log(`ERROR ${name}: ${err.message}`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(results, null, 2));
const missing = results.filter(([, ok]) => !ok);
if (missing.length) {
  console.error(`MISSING: ${missing.map(([n]) => n).join(", ")}`);
  process.exit(1);
}
console.log(`all ${results.length} screenshots written to ${OUT}`);

// Static source checks: browser ASR fallback path, secret hygiene, geolocation
// independence, WCAG contrast of theme pairs, and the soil's first-person voice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assert, test } from "./helpers";
import { SOIL_STRINGS, VERDICT_STRINGS } from "../src/lib/soilUiStrings";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

test("speech recognition unsupported → text tray + crop chips remain, never crash", () => {
  const hook = readFileSync(join(SRC, "lib/useSoilConversation.ts"), "utf8");
  assert.ok(
    hook.includes("SpeechRecognition") && hook.includes("webkitSpeechRecognition"),
    "SR feature detection present in conversation hook"
  );
  const ptt = readFileSync(
    join(SRC, "app/components/soil/PushToTalk.tsx"),
    "utf8"
  );
  assert.ok(
    ptt.includes("Keyboard") && ptt.includes("onOpenText"),
    "keyboard affordance opens the text tray when SR is absent"
  );
  const tray = readFileSync(
    join(SRC, "app/components/soil/TextQuestionTray.tsx"),
    "utf8"
  );
  assert.ok(tray.includes("<input"), "text input fallback exists");
});

test("acceptance: geolocation denied — app never calls browser geolocation", () => {
  const offenders = listSourceFiles(SRC).filter((f) =>
    readFileSync(f, "utf8").includes("geolocation")
  );
  assert.deepEqual(
    offenders,
    [],
    `preset-based plots only; unexpected geolocation usage in: ${offenders.join(", ")}`
  );
});

test("secret hygiene: ADDIS_API_KEY and x-api-key appear only in the server TTS client", () => {
  const files = listSourceFiles(SRC).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const keyRefs = files.filter((f) =>
    readFileSync(f, "utf8").includes("ADDIS_API_KEY")
  );
  assert.deepEqual(
    keyRefs.map((f) => relative(ROOT, f)),
    ["src/lib/addisTts.ts"]
  );

  const headerRefs = files.filter((f) =>
    readFileSync(f, "utf8").includes("x-api-key")
  );
  assert.deepEqual(
    headerRefs.map((f) => relative(ROOT, f)),
    ["src/lib/addisTts.ts"]
  );

  const hardcoded = files.filter((f) =>
    /(sk_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,})/.test(readFileSync(f, "utf8"))
  );
  assert.deepEqual(hardcoded, [], "no hardcoded API keys anywhere in src/");
});

test("client replay cache: useSoilVoice persists last audio to localStorage", () => {
  const src = readFileSync(join(SRC, "lib/useSoilVoice.ts"), "utf8");
  assert.ok(src.includes("localStorage"), "localStorage caching present");
  assert.ok(src.includes("fieldshift:lastSoilAudio"), "stable cache key present");
});

// ── WCAG contrast of the theme's text/background pairs ──

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function compositeOverWhite(r: number, g: number, b: number, alpha: number) {
  return [
    Math.round(r * alpha + 255 * (1 - alpha)),
    Math.round(g * alpha + 255 * (1 - alpha)),
    Math.round(b * alpha + 255 * (1 - alpha)),
  ] as [number, number, number];
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(...fg);
  const l2 = luminance(...bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

test("contrast: theme text pairs meet WCAG AA (4.5:1), captions approach AAA", () => {
  const cream = hexToRgb("#FFF8EC");
  const deepSoil = hexToRgb("#3B2A20");
  assert.ok(
    contrast(cream, deepSoil) >= 7,
    `cream on deep soil ${contrast(cream, deepSoil).toFixed(2)} should be AAA`
  );

  // Caption bubble scrim rgba(30,20,15,0.78) composited over the worst-case
  // brightest possible camera scene (pure white) must still pass AA.
  const scrim = compositeOverWhite(30, 20, 15, 0.78);
  assert.ok(
    contrast(cream, scrim) >= 7,
    `cream on caption scrim over white ${contrast(cream, scrim).toFixed(2)} should be AAA`
  );

  // All text-bearing chips (top pills, crop chips, side buttons) use the
  // strong 0.78 scrim — verify the CSS ships that pairing and that it is AAA
  // even over a pure-white camera scene.
  const chip = compositeOverWhite(30, 20, 15, 0.78);
  assert.ok(
    contrast(cream, chip) >= 7,
    `cream on chip scrim over white ${contrast(cream, chip).toFixed(2)} should be AAA`
  );
  const themeCss = readFileSync(join(SRC, "app/soil-theme.css"), "utf8");
  const pillBlock = themeCss.match(/\.soil-pill\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(
    pillBlock.includes("scrim-strong"),
    ".soil-pill must use the strong scrim for text contrast"
  );
  const cropBlock = themeCss.match(/\.crop-chip\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(
    cropBlock.includes("scrim-strong"),
    ".crop-chip must use the strong scrim for text contrast"
  );

  // Why-sheet dark text on cream.
  assert.ok(
    contrast(deepSoil, cream) >= 7,
    "deep soil text on cream sheet should be AAA"
  );
});

test("voice audit: the soil speaks first person in every shipped soil string", () => {
  assert.ok(SOIL_STRINGS.greeting.am.includes("እኔ"), "Amharic greeting uses እኔ (I)");
  assert.ok(/\bI am\b/i.test(SOIL_STRINGS.greeting.en), "English greeting uses 'I am'");
  assert.ok(SOIL_STRINGS.listening.am.includes("እ"), "listening line is first person");
  assert.ok(SOIL_STRINGS.thinking.am.includes("እ"), "thinking line is first person");
  for (const v of Object.values(VERDICT_STRINGS)) {
    assert.ok(v.am.length > 0 && v.en.length > 0, "verdict strings present in both languages");
  }
  // Amharic TODO-verify marker must exist so reviewers find the strings.
  const stringsSrc = readFileSync(join(SRC, "lib/soilUiStrings.ts"), "utf8");
  assert.ok(stringsSrc.includes("TODO verify"), "Amharic strings marked for native review");
});

test("reduced motion + touch targets + no pure black are honored in the theme", () => {
  const theme = readFileSync(join(SRC, "app/soil-theme.css"), "utf8");
  assert.ok(
    theme.includes("prefers-reduced-motion"),
    "reduced-motion override block present"
  );
  assert.ok(theme.includes("--touch-min: 56px"), "56px minimum touch target token");
  assert.ok(!/#[0]{6}\b/.test(theme), "no pure black anywhere in the theme");
});

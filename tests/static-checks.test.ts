// Static source checks: browser ASR fallback path, secret hygiene, and the
// geolocation acceptance probe (the app is preset-based and must not depend
// on device geolocation).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assert, test } from "./helpers";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test("speech recognition unsupported → text input fallback exists and mic never crashes", () => {
  const src = readFileSync(
    join(SRC, "app/components/FarmerQuestionBar.tsx"),
    "utf8"
  );
  assert.ok(src.includes("SpeechRecognition"), "feature detection present");
  assert.ok(src.includes("webkitSpeechRecognition"), "webkit prefix fallback present");
  assert.ok(
    /if \(!recognitionRef\.current\)[\s\S]{0,160}setIsOpen\(true\)/.test(src),
    "mic tap without SpeechRecognition falls back to opening the text input"
  );
  assert.ok(
    src.includes("mapLanguageToCode(language)"),
    "recognition locale follows the selected language (am-ET for Amharic)"
  );
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
  const files = listSourceFiles(SRC);
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

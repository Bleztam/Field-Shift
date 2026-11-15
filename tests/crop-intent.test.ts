// Unit tests for crop/intent extraction fallback and the code-only cropVerdict.
import { assert, test } from "./helpers";
import {
  cropVerdict,
  inferIntentFromText,
  matchCropFromText,
} from "../src/lib/cropIntent";
import { mapLanguageToCode, looksLikeAmharic } from "../src/lib/languageCodes";
import { PRESETS } from "../src/lib/presets";

const riftValley = PRESETS[0]; // eth-crv-teff
const nevada = PRESETS[1]; // nv-humboldt-alfalfa

test("crop keywords: Amharic + English names map to canonical crops", () => {
  assert.equal(matchCropFromText("ጤፍ ስትከል ይሆን?"), "teff");
  assert.equal(matchCropFromText("በቆሎ"), "maize");
  assert.equal(matchCropFromText("ሽምብራ"), "chickpea");
  assert.equal(matchCropFromText("ስንዴ"), "wheat");
  assert.equal(matchCropFromText("ማሽላ"), "sorghum");
  assert.equal(matchCropFromText("ቦለቄ"), "haricot_bean");
  assert.equal(matchCropFromText("ፈሰስ"), "haricot_bean");
  assert.equal(matchCropFromText("Will chickpeas survive the dry months?"), "chickpea");
  assert.equal(matchCropFromText("what about maize this year"), "maize");
  assert.equal(matchCropFromText("why are you cracking?"), null);
});

test("intent keywords: irrigation, cash, soil health, plant check", () => {
  assert.equal(inferIntentFromText("I can irrigate from the river"), "irrigation");
  assert.equal(inferIntentFromText("What can I plant that still makes cash?"), "cash_income");
  assert.equal(inferIntentFromText("Why are you cracking?"), "soil_health");
  assert.equal(inferIntentFromText("ሽምብራ መትከል እችላለሁ?"), "plant_check"); // contains ተክል
  assert.equal(inferIntentFromText("hello there"), "general");
});

test("acceptance: Rift Valley in November → chickpea verdict is plant", () => {
  const v = cropVerdict({
    crop: "chickpea",
    intent: "plant_check",
    preset: riftValley,
    monthIndex: 10, // November
  });
  assert.equal(v.verdict, "plant");
  assert.equal(v.confidence, "high");
  assert.ok(v.reasons.length > 0);
  assert.ok(
    v.reasons.some((r) => r.toLowerCase().includes("bare-soil erosion window")),
    "reasons should cite the upcoming bare-soil window"
  );
});

test("verdict: maize in Rift Valley January (dry bare window) → wait without irrigation", () => {
  const v = cropVerdict({
    crop: "maize",
    intent: "plant_check",
    preset: riftValley,
    monthIndex: 0, // January — inside Dec..Mar erosion window
  });
  assert.equal(v.verdict, "wait");
});

test("acceptance: mocked river irrigation softens the same maize verdict to plant_with_caution", () => {
  const dry = cropVerdict({
    crop: "maize",
    intent: "general",
    preset: riftValley,
    monthIndex: 0,
  });
  const irrigated = cropVerdict({
    crop: "maize",
    intent: "irrigation", // farmer says they can pull river water
    preset: riftValley,
    monthIndex: 0,
  });
  assert.equal(dry.verdict, "wait");
  assert.equal(irrigated.verdict, "plant_with_caution");
  assert.ok(
    irrigated.reasons.some((r) => r.toLowerCase().includes("irrigation")),
    "irrigated verdict should explain the offset"
  );
});

test("verdict: Nevada November chickpea inside bare window → plant", () => {
  const v = cropVerdict({
    crop: "chickpea",
    intent: "general",
    preset: nevada,
    monthIndex: 10, // November — inside Nevada's Nov..Mar fallow window
  });
  assert.equal(v.verdict, "plant");
  assert.equal(v.confidence, "medium"); // satellite data present, generic intent
});

test("verdict is deterministic: identical inputs → identical outputs", () => {
  const args = {
    crop: "teff" as const,
    intent: "general" as const,
    preset: riftValley,
    monthIndex: 4,
  };
  assert.deepEqual(cropVerdict(args), cropVerdict(args));
});

test("verdict degrades to low confidence without satellite data", () => {
  const v = cropVerdict({ crop: "wheat", preset: {}, monthIndex: 3 });
  assert.equal(v.confidence, "low");
  assert.ok(v.reasons.length > 0);
});

test("language mapping: Amharic → am-ET and Ge'ez detection", () => {
  assert.equal(mapLanguageToCode("Amharic"), "am-ET");
  assert.equal(mapLanguageToCode("Afaan Oromo"), "om-ET");
  assert.equal(mapLanguageToCode("Spanish"), "es-ES");
  assert.equal(mapLanguageToCode("English"), "en-US");
  assert.equal(mapLanguageToCode(undefined), "en-US");
  assert.ok(looksLikeAmharic("ሰላም"));
  assert.ok(!looksLikeAmharic("hello"));
});

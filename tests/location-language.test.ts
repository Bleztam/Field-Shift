// Location-driven language tests: region mapping (Nominatim + coarse bbox),
// language resolution priority, per-language Addis voice selection, closing
// line appended in code, and the new soil-voice payload/response fields.
import {
  addisCreatedResponse,
  assert,
  fetchCalls,
  jsonResponse,
  setEnv,
  setFetchHandler,
  test,
} from "./helpers";
import { coarseRegionFor, mapNominatimAddress, __clearRegionCacheForTests } from "../src/lib/region";
import { resolveLanguage, SUPPORTED_LANGUAGES, REGION_LANGUAGE_MAP } from "../src/lib/languageConfig";
import { REGION_CHOICES, choiceToLocation } from "../src/lib/location";
import { matchCropFromText } from "../src/lib/cropIntent";
import { __clearAddisCacheForTests } from "../src/lib/addisTts";
import { __clearAddisVoiceCacheForTests } from "../src/lib/addisVoices";
import { GET as regionGET } from "../src/app/api/region/route";
import { POST as soilVoicePOST } from "../src/app/api/soil-voice/route";
import { POST as ttsPOST } from "../src/app/api/tts/route";
import { PRESETS } from "../src/lib/presets";

const GEMINI_KEY = "test-gemini-key-456";
const ADDIS_KEY = "test-addis-key-123";

function resetEnv(): void {
  __clearAddisCacheForTests();
  __clearAddisVoiceCacheForTests();
  __clearRegionCacheForTests();
  setEnv("GEMINI_API_KEY", GEMINI_KEY);
  setEnv("ADDIS_API_KEY", ADDIS_KEY);
  setEnv("ADDIS_VOICE_ID", undefined);
  for (const code of ["AM", "OM", "TI", "SID", "WAL"]) {
    setEnv(`ADDIS_VOICE_ID_${code}`, undefined);
  }
}

const isAddisGenerations = (url: string) =>
  url.includes("api.addisassistant.com") && url.includes("/voice/generations");
const isAddisVoices = (url: string) =>
  url.includes("api.addisassistant.com") && url.includes("/voice/voices");
const isGemini = (url: string) => url.includes("generativelanguage.googleapis.com");
const isNominatim = (url: string) => url.includes("nominatim.openstreetmap.org");

function stubReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof soilVoicePOST>[0];
}

function stubRegionReq(url: string) {
  return { url } as unknown as Parameters<typeof regionGET>[0];
}

// ─── Region mapping (acceptance coordinates) ─────────────────────────────

test("region: Adama + Jimma → Oromia → default language om", () => {
  for (const [lat, lon] of [
    [8.54, 39.27], // Adama
    [7.67, 36.83], // Jimma
  ]) {
    const region = coarseRegionFor(lat, lon);
    assert.equal(region.regionKey, "oromia", `(${lat},${lon}) should be Oromia`);
    assert.equal(region.source, "fallback");
    assert.equal(region.confidence, "low", "bbox never claims precision");
  }
  assert.equal(resolveLanguage(null, "oromia").code, "om");
});

test("region: Bahir Dar → Amhara → am", () => {
  const region = coarseRegionFor(11.6, 37.38);
  assert.equal(region.regionKey, "amhara");
  assert.equal(resolveLanguage(null, "amhara").code, "am");
});

test("region: Addis Ababa → am with one-tap om offered", () => {
  const region = coarseRegionFor(9.01, 38.75);
  assert.equal(region.regionKey, "addis_ababa");
  assert.equal(REGION_LANGUAGE_MAP.addis_ababa.default, "am");
  assert.equal(REGION_LANGUAGE_MAP.addis_ababa.alsoOffer, "om");
  assert.equal(resolveLanguage(null, "addis_ababa").code, "am");
});

test("region: Mekelle → Tigray → ti", () => {
  const region = coarseRegionFor(13.49, 39.47);
  assert.equal(region.regionKey, "tigray");
  assert.equal(resolveLanguage(null, "tigray").code, "ti");
});

test("region: Hawassa → Sidama → sid; Wolaita Sodo → snnpr → wal", () => {
  assert.equal(coarseRegionFor(7.05, 38.47).regionKey, "sidama");
  assert.equal(resolveLanguage(null, "sidama").code, "sid");
  assert.equal(coarseRegionFor(6.86, 37.78).regionKey, "snnpr");
  assert.equal(resolveLanguage(null, "snnpr").code, "wal");
});

test("region: outside Ethiopia → unknown → falls back to am", () => {
  const region = coarseRegionFor(52.5, 13.4); // Berlin
  assert.equal(region.regionKey, "unknown");
  assert.equal(resolveLanguage(null, "unknown").code, "am");
  assert.equal(resolveLanguage(null, null).code, "am");
});

test("region: Nominatim address names map to region keys", () => {
  assert.equal(
    mapNominatimAddress({ state: "Oromia Region" }).regionKey,
    "oromia"
  );
  assert.equal(
    mapNominatimAddress({ state: "Addis Ababa" }).regionKey,
    "addis_ababa"
  );
  assert.equal(mapNominatimAddress({ state: "Tigray" }).regionKey, "tigray");
  assert.equal(
    mapNominatimAddress({ state: "Southern Nations, Nationalities, and Peoples" }).regionKey,
    "snnpr"
  );
  assert.equal(
    mapNominatimAddress({ state: "Afar" }).regionKey,
    "other",
    "unsupported speech regions still resolve (→ am with note)"
  );
  assert.equal(mapNominatimAddress({}).regionKey, "unknown");
});

// ─── /api/region route ────────────────────────────────────────────────────

test("/api/region: Nominatim success → source nominatim, confidence medium, cached", async () => {
  resetEnv();
  let nominatimCalls = 0;
  setFetchHandler((url) => {
    if (isNominatim(url)) {
      nominatimCalls++;
      return jsonResponse({ address: { state: "Oromia Region" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await regionGET(stubRegionReq("https://x/api/region?lat=8.54&lon=39.27"));
  const body = await res.json();
  assert.equal(body.regionKey, "oromia");
  assert.equal(body.source, "nominatim");
  assert.equal(body.confidence, "medium");
  assert.equal(body.regionName, "Oromia Region");

  // Second request at the same rounded coords → cache hit, no new upstream call.
  const res2 = await regionGET(stubRegionReq("https://x/api/region?lat=8.541&lon=39.269"));
  const body2 = await res2.json();
  assert.equal(body2.regionKey, "oromia");
  assert.equal(nominatimCalls, 1, "2-decimal coord cache avoids a second call");
});

test("/api/region: Nominatim failure → coarse bbox fallback, no crash", async () => {
  resetEnv();
  setFetchHandler(() => {
    throw new Error("network down");
  });
  const res = await regionGET(stubRegionReq("https://x/api/region?lat=13.49&lon=39.47"));
  const body = await res.json();
  assert.equal(body.regionKey, "tigray", "coarse bbox still resolves");
  assert.equal(body.source, "fallback");
  assert.equal(body.confidence, "low");
});

test("/api/region: bad input → 400 with unknown region, never throws", async () => {
  resetEnv();
  setFetchHandler(() => {
    throw new Error("no upstream call expected");
  });
  const res = await regionGET(stubRegionReq("https://x/api/region?lat=abc&lon=--"));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.regionKey, "unknown");
});

// ─── Language resolution priority ─────────────────────────────────────────

test("language: saved farmer choice beats region default", () => {
  const resolved = resolveLanguage("ti", "oromia");
  assert.equal(resolved.code, "ti");
  assert.equal(resolved.suggested, false);
});

test("language: region default is marked as suggested", () => {
  const resolved = resolveLanguage(null, "oromia");
  assert.equal(resolved.code, "om");
  assert.equal(resolved.suggested, true);
});

// ─── Region picker choices (geo denied + no saved → picker) ──────────────

test("picker: every choice has valid coords, labels, and a known region key", () => {
  assert.ok(REGION_CHOICES.length >= 6, "main regions offered");
  for (const choice of REGION_CHOICES) {
    assert.ok(Number.isFinite(choice.lat) && Number.isFinite(choice.lon));
    assert.ok(choice.labelAm.length > 0 && choice.labelEn.length > 0);
    const loc = choiceToLocation(choice);
    assert.equal(loc.source, "chosen", "picker results are always labeled chosen");
    assert.equal(loc.regionKey, choice.key);
    // Chosen coordinates must map back to the same region in the coarse bbox,
    // so NASA POWER weather and the spoken language stay consistent.
    const check = coarseRegionFor(choice.lat, choice.lon);
    assert.equal(
      check.regionKey,
      choice.key,
      `${choice.labelEn} representative point lands in ${check.regionKey}, expected ${choice.key}`
    );
  }
});

// ─── Per-language crop keyword extraction ─────────────────────────────────

test("crop names: Oromo + Tigrinya glosses feed keyword extraction", () => {
  assert.equal(matchCropFromText("boqolloo tiin?", "om"), "maize");
  assert.equal(matchCropFromText("qamaadii", "om"), "wheat");
  assert.equal(matchCropFromText("xafi", "om"), "teff");
  assert.equal(matchCropFromText("ጣፍ", "ti"), "teff");
  // English + Amharic still work regardless of active language.
  assert.equal(matchCropFromText("Can I plant teff?", "om"), "teff");
  assert.equal(matchCropFromText("ሽምብራ", "wal"), "chickpea");
});

// ─── Addis voice selection + soil-voice integration ───────────────────────

test("soil-voice om: Addis called with language om + first returned voice; closing appended in code", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ data: [{ id: "om-voice-1" }, { id: "om-voice-2" }] });
    if (isAddisGenerations(url)) return addisCreatedResponse();
    if (isGemini(url)) return jsonResponse({ error: "down" }, 500);
    if (isNominatim(url)) return jsonResponse({ address: { state: "Oromia Region" } });
    throw new Error(`unexpected fetch: ${url}`);
  });

  const res = await soilVoicePOST(
    stubReq({
      language: "om",
      farmerQuestion: "boqolloo dhaabu?",
      lat: 8.54,
      lon: 39.27,
      locationSource: "live",
      nasaData: { preset: PRESETS[0], latestPower: { T2M: 22, PRECTOTCORR: 0.1 } },
    })
  );
  const body = await res.json();

  assert.equal(body.audioProvider, "addis");
  const genCalls = fetchCalls.filter((c) => isAddisGenerations(c.url));
  assert.equal(genCalls.length, 1, "one billable generation");
  assert.equal(genCalls[0].body?.language, "om", "Addis receives the om language code");
  assert.equal(genCalls[0].body?.voice_id, "om-voice-1", "first returned voice used");

  // Hardcoded closing appended in code, never by the LLM.
  assert.ok(
    String(body.firstPersonScript).endsWith(SUPPORTED_LANGUAGES.om.closingLine),
    "Oromo closing line appended"
  );
  // Deterministic Oromo template (Gemini was down) + code verdict.
  assert.equal(body.crop, "maize", "Oromo crop name extracted");
  assert.ok(["plant", "plant_with_caution", "wait"].includes(body.verdict));

  // New response fields.
  assert.equal(body.language, "om");
  assert.equal(body.regionName, "Oromia Region");
  assert.equal(body.locationSource, "live");
});

test("soil-voice om cache: identical repeat question → no second billable generation", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ data: [{ id: "om-voice-1" }] });
    if (isAddisGenerations(url)) return addisCreatedResponse();
    if (isGemini(url)) return jsonResponse({ error: "down" }, 500);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const payload = {
    language: "om",
    farmerQuestion: "xafi dhaabu?",
    lat: 8.54,
    lon: 39.27,
    locationSource: "live",
    nasaData: { preset: PRESETS[0], latestPower: { T2M: 22 } },
  };
  await soilVoicePOST(stubReq(payload));
  await soilVoicePOST(stubReq(payload));
  const genCalls = fetchCalls.filter((c) => isAddisGenerations(c.url));
  assert.equal(genCalls.length, 1, "sha256(lang+voice+text) cache prevents re-billing");
});

test("voice: env override ADDIS_VOICE_ID_OM wins and skips the voices listing", async () => {
  resetEnv();
  setEnv("ADDIS_VOICE_ID_OM", "om-custom-env");
  setFetchHandler((url) => {
    if (isAddisVoices(url)) throw new Error("voices listing must be skipped when env override set");
    if (isAddisGenerations(url)) return addisCreatedResponse();
    if (isGemini(url)) return jsonResponse({ error: "down" }, 500);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await soilVoicePOST(
    stubReq({
      language: "om",
      farmerQuestion: "xafi dhaabu?",
      nasaData: { preset: PRESETS[0], latestPower: {} },
    })
  );
  const body = await res.json();
  assert.equal(body.audioProvider, "addis");
  const genCalls = fetchCalls.filter((c) => isAddisGenerations(c.url));
  assert.equal(genCalls[0].body?.voice_id, "om-custom-env");
});

test("no Addis voices for a language → browser provider + captions, no crash", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ data: [] });
    if (isAddisGenerations(url)) throw new Error("no voice → no generation attempt");
    if (isGemini(url)) return jsonResponse({ error: "down" }, 500);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await soilVoicePOST(
    stubReq({
      language: "sid",
      farmerQuestion: "teff?",
      nasaData: { preset: PRESETS[0], latestPower: {} },
    })
  );
  const body = await res.json();
  assert.equal(body.audioProvider, "browser");
  assert.equal(body.audioBase64, null);
  assert.ok(body.firstPersonScript.length > 0, "captions still produced");
  assert.ok(
    String(body.firstPersonScript).endsWith(SUPPORTED_LANGUAGES.sid.closingLine)
  );
  assert.equal(body.language, "sid");
});

test("/api/tts: language code om → Addis generations body carries om + resolved voice", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ data: [{ id: "om-voice-1" }] });
    if (isAddisGenerations(url)) return addisCreatedResponse();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "Akkam biyyee", language: "om" }));
  const body = await res.json();
  assert.equal(body.audioProvider, "addis");
  const genCalls = fetchCalls.filter((c) => isAddisGenerations(c.url));
  assert.equal(genCalls[0].body?.language, "om");
  assert.equal(genCalls[0].body?.voice_id, "om-voice-1");
});

test("closing line: Gemini am script trimmed to 2 sentences so closing survives the TTS cap", async () => {
  resetEnv();
  const longScript =
    "አንድ ሀ ሁለት ሐ ሶቴ። ሁለት ሀ ሁለት ሐ ሶቴ። ሶስት ሀ ሁለት ሐ ሶቴ። አራት ሀ ሁለት ሐ ሶቴ።";
  const llmPayload = {
    groundTruthCalibration: {
      residueCoverPct: 30,
      surfaceCrackSeverity: "mild",
      uncertaintyReduction: { satelliteOnlyPct: 34, fusedPct: 11 },
    },
    mood: "hopeful",
    firstPersonScript: longScript,
    englishSubtitles: "one two three four",
    strategies: [
      { name: "Current Baseline", why_suggested: "w", nasa_evidence: "n", expected_benefits: "b", satellite_info_gaps: "g", local_expert_risks: "r" },
      { name: "Bare-Window Bridge Crop", why_suggested: "w", nasa_evidence: "n", expected_benefits: "b", satellite_info_gaps: "g", local_expert_risks: "r" },
      { name: "Hydro-Shield Multi-Year Rotation", why_suggested: "w", nasa_evidence: "n", expected_benefits: "b", satellite_info_gaps: "g", local_expert_risks: "r" },
    ],
  };
  setFetchHandler((url, init) => {
    if (isGemini(url)) {
      const parsed = JSON.parse(String(init?.body));
      if (parsed.generationConfig?.maxOutputTokens === 128) {
        return jsonResponse({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
      }
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(llmPayload) }] } }],
      });
    }
    if (isAddisGenerations(url)) return addisCreatedResponse();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await soilVoicePOST(
    stubReq({
      language: "am",
      farmerQuestion: "ሰላም",
      nasaData: { preset: PRESETS[0], latestPower: {} },
    })
  );
  const body = await res.json();
  const script = String(body.firstPersonScript);
  assert.ok(script.endsWith(SUPPORTED_LANGUAGES.am.closingLine), "closing appended");
  const sentences = script.match(/[^.!?።\n]+[.!?።]*/gu) ?? [];
  assert.ok(sentences.length <= 3, `script fits the 3-sentence TTS cap (got ${sentences.length})`);
  // The text sent to Addis contains the closing line.
  const genCalls = fetchCalls.filter((c) => isAddisGenerations(c.url));
  assert.ok(
    String(genCalls[0].body?.text).includes(SUPPORTED_LANGUAGES.am.closingLine),
    "spoken audio includes the closing line"
  );
});

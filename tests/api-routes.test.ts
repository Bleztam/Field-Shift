// Integration tests for /api/tts, /api/tts/health and /api/soil-voice with
// all upstream APIs (Addis AI + Gemini) mocked at the fetch layer.
import {
  addisCreatedResponse,
  assert,
  fetchCalls,
  jsonResponse,
  setEnv,
  setFetchHandler,
  test,
} from "./helpers";
import { __clearAddisCacheForTests } from "../src/lib/addisTts";
import { POST as ttsPOST } from "../src/app/api/tts/route";
import { GET as healthGET } from "../src/app/api/tts/health/route";
import { POST as soilVoicePOST } from "../src/app/api/soil-voice/route";
import { PRESETS } from "../src/lib/presets";

const GEMINI_KEY = "test-gemini-key-456";
const ADDIS_KEY = "test-addis-key-123";

function stubReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof ttsPOST>[0];
}

function stubGetReq() {
  return { headers: new Headers() } as unknown as Parameters<typeof healthGET>[0];
}

function resetEnv(): void {
  __clearAddisCacheForTests();
  setEnv("GEMINI_API_KEY", GEMINI_KEY);
  setEnv("ADDIS_API_KEY", ADDIS_KEY);
  setEnv("ADDIS_VOICE_ID", undefined);
}

const isAddis = (url: string) => url.includes("api.addisassistant.com");
const isAddisGenerations = (url: string) =>
  isAddis(url) && url.includes("/voice/generations");
const isAddisVoices = (url: string) => isAddis(url) && url.includes("/voice/voices");
const isGemini = (url: string) => url.includes("generativelanguage.googleapis.com");

function geminiTtsOk(): Response {
  const pcm = Buffer.alloc(96, 0).toString("base64");
  return jsonResponse({
    candidates: [{ content: { parts: [{ inlineData: { data: pcm } }] } }],
  });
}

function geminiTextOk(payload: unknown): Response {
  return jsonResponse({
    candidates: [
      { content: { parts: [{ text: JSON.stringify(payload) }] } },
    ],
  });
}

// ─── /api/tts ───────────────────────────────────────────────────────────────

test("/api/tts: Amharic text → Addis first, provider=addis, mp3 data URI", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisGenerations(url)) return addisCreatedResponse();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "ሰላም አፈር", language: "Amharic" }));
  const body = await res.json();
  assert.equal(body.audioProvider, "addis");
  assert.ok(body.audioBase64.startsWith("data:audio/mpeg;base64,"));
  assert.equal(fetchCalls.filter((c) => isGemini(c.url)).length, 0, "Gemini not touched when Addis succeeds");
});

test("/api/tts: Addis 401 → falls back to Gemini TTS (provider=gemini)", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisGenerations(url)) return jsonResponse({ message: "unauthorized" }, 401);
    if (isGemini(url)) return geminiTtsOk();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "ሰላም", language: "Amharic" }));
  const body = await res.json();
  assert.equal(body.audioProvider, "gemini");
  assert.ok(body.audioBase64.startsWith("data:audio/wav;base64,"));
});

test("/api/tts: Addis 500 + Gemini down → audioBase64 null, provider=browser", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisGenerations(url)) return jsonResponse({ message: "boom" }, 500);
    if (isGemini(url)) return jsonResponse({ error: "down" }, 503);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "ሰላም", language: "Amharic" }));
  const body = await res.json();
  assert.equal(body.audioProvider, "browser");
  assert.equal(body.audioBase64, null);
});

test("/api/tts: English text skips Addis entirely", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddis(url)) throw new Error("Addis must not be called for English text");
    if (isGemini(url)) return geminiTtsOk();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "I am the living soil." }));
  const body = await res.json();
  assert.equal(body.audioProvider, "gemini");
});

test("/api/tts: Ge'ez script is detected as Amharic even without language hint", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisGenerations(url)) return addisCreatedResponse();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await ttsPOST(stubReq({ text: "እኔ አፈር ነኝ።" }));
  const body = await res.json();
  assert.equal(body.audioProvider, "addis");
});

test("/api/tts: missing text still returns 400", async () => {
  resetEnv();
  setFetchHandler(() => {
    throw new Error("no fetch expected");
  });
  const res = await ttsPOST(stubReq({}));
  assert.equal(res.status, 400);
});

// ─── /api/tts/health ────────────────────────────────────────────────────────

test("/api/tts/health: configured+reachable, exactly two response fields, no secrets", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ data: [{ id: "am-hamen" }] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await healthGET(stubGetReq());
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["configured", "reachable"]);
  assert.equal(body.configured, true);
  assert.equal(body.reachable, true);
  assert.ok(!JSON.stringify(body).includes(ADDIS_KEY));
});

test("/api/tts/health: no key → configured=false, reachable=false, zero upstream calls", async () => {
  resetEnv();
  setEnv("ADDIS_API_KEY", undefined);
  setFetchHandler(() => {
    throw new Error("no upstream call expected without a key");
  });
  const res = await healthGET(stubGetReq());
  const body = await res.json();
  assert.deepEqual(body, { configured: false, reachable: false });
});

test("/api/tts/health: upstream error → reachable=false", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisVoices(url)) return jsonResponse({ message: "bad key" }, 401);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await healthGET(stubGetReq());
  const body = await res.json();
  assert.deepEqual(body, { configured: true, reachable: false });
});

// ─── /api/soil-voice ────────────────────────────────────────────────────────

test("acceptance: Gemini fully down → Amharic template still voiced by Addis, verdict from code", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isAddisGenerations(url)) return addisCreatedResponse();
    if (isGemini(url)) return jsonResponse({ error: "all models down" }, 500);
    throw new Error(`unexpected fetch: ${url}`);
  });

  const res = await soilVoicePOST(
    stubReq({
      language: "Amharic",
      farmerQuestion: "ሽምብራ መትከል እችላለሁ?",
      nasaData: {
        preset: PRESETS[0],
        latestPower: { T2M: 22, PRECTOTCORR: 0.1 },
      },
    }) as unknown as Parameters<typeof soilVoicePOST>[0]
  );
  assert.equal(res.status, 200);
  const body = await res.json();

  // Fallback template path: full UI contract intact.
  assert.equal(body.strategies.length, 3);
  assert.match(body.firstPersonScript, /[\u1200-\u137F]/, "Amharic template script expected");

  // Voiced by Addis despite Gemini being down.
  assert.equal(body.audioProvider, "addis");
  assert.ok(body.audioBase64.startsWith("data:audio/mpeg;base64,"));

  // Crop/intent recovered by keyword fallback; verdict computed in code.
  assert.equal(body.crop, "chickpea");
  assert.ok(["plant", "plant_with_caution", "wait"].includes(body.verdict));
  assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0);
  assert.ok(["low", "medium", "high"].includes(body.confidence));
});

test("/api/soil-voice: Gemini main success → LLM script kept, extraction feeds code verdict", async () => {
  resetEnv();
  const llmPayload = {
    groundTruthCalibration: {
      residueCoverPct: 35,
      surfaceCrackSeverity: "mild",
      uncertaintyReduction: { satelliteOnlyPct: 34, fusedPct: 11 },
    },
    mood: "hopeful",
    firstPersonScript: "I am the soil and your chickpea plan gives me hope.",
    englishSubtitles: "I am the soil and your chickpea plan gives me hope.",
    strategies: [
      {
        name: "Current Baseline",
        why_suggested: "w",
        nasa_evidence: "n",
        expected_benefits: "b",
        satellite_info_gaps: "g",
        local_expert_risks: "r",
      },
      {
        name: "Bare-Window Bridge Crop",
        why_suggested: "w",
        nasa_evidence: "n",
        expected_benefits: "b",
        satellite_info_gaps: "g",
        local_expert_risks: "r",
      },
      {
        name: "Hydro-Shield Multi-Year Rotation",
        why_suggested: "w",
        nasa_evidence: "n",
        expected_benefits: "b",
        satellite_info_gaps: "g",
        local_expert_risks: "r",
      },
    ],
  };

  setFetchHandler((url, init) => {
    if (isGemini(url)) {
      const body = JSON.parse(String(init?.body));
      const maxTokens = body.generationConfig?.maxOutputTokens;
      if (body.generationConfig?.responseModalities) return geminiTtsOk();
      if (maxTokens === 128) {
        // crop/intent extraction call
        return geminiTextOk({ crop: "chickpea", intent: "plant_check" });
      }
      return geminiTextOk(llmPayload);
    }
    if (isAddisGenerations(url)) {
      throw new Error("Addis must not run for an English session");
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const res = await soilVoicePOST(
    stubReq({
      language: "English",
      farmerQuestion: "Will chickpeas survive the dry months?",
      nasaData: { preset: PRESETS[0], latestPower: { T2M: 24 } },
    }) as unknown as Parameters<typeof soilVoicePOST>[0]
  );
  const body = await res.json();

  assert.equal(body.firstPersonScript, llmPayload.firstPersonScript);
  assert.equal(body.mood, "hopeful");
  assert.equal(body.strategies.length, 3);
  assert.ok(body.strategies.every((s: { weights?: unknown }) => s.weights), "default weights attached");

  // Gemini extracted crop/intent, but the verdict came from code.
  assert.equal(body.crop, "chickpea");
  assert.equal(body.intent, "plant_check");
  assert.ok(["plant", "plant_with_caution", "wait"].includes(body.verdict));
  assert.ok(body.reasons.length > 0);

  // English session → Gemini TTS provider.
  assert.equal(body.audioProvider, "gemini");

  const extractionCalls = fetchCalls.filter(
    (c) =>
      isGemini(c.url) &&
      (c.body as { generationConfig?: { maxOutputTokens?: number } })?.generationConfig
        ?.maxOutputTokens === 128
  );
  assert.equal(extractionCalls.length, 1, "exactly one extraction call");
});

test("/api/soil-voice: no question → no extraction call, no verdict fields", async () => {
  resetEnv();
  setFetchHandler((url) => {
    if (isGemini(url)) return jsonResponse({ error: "down" }, 500);
    if (isAddisGenerations(url)) return addisCreatedResponse();
    throw new Error(`unexpected fetch: ${url}`);
  });
  const res = await soilVoicePOST(
    stubReq({
      language: "English",
      nasaData: { preset: PRESETS[0], latestPower: {} },
    }) as unknown as Parameters<typeof soilVoicePOST>[0]
  );
  const body = await res.json();
  assert.equal(body.crop, undefined);
  assert.equal(body.verdict, undefined);
  const extractionCalls = fetchCalls.filter(
    (c) =>
      isGemini(c.url) &&
      (c.body as { generationConfig?: { maxOutputTokens?: number } })?.generationConfig
        ?.maxOutputTokens === 128
  );
  assert.equal(extractionCalls.length, 0);
});

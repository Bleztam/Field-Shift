// ─── /api/soil-voice — Gemini NLU/explanation + code verdict + Addis TTS ───
// Pipeline: (1) Gemini extracts { crop, intent } from the farmer question
// (schema-validated, keyword fallback in the active language) → (2) cropVerdict
// is computed in code, never by the LLM → (3) Gemini writes the first-person
// monologue in the target language → (4) the hardcoded closing line is
// appended IN CODE → (5) audio via Addis AI (per-language voice), Gemini TTS
// for am/en/es, browser last.
//
// Request additions (all optional, backward compatible):
//   { farmerQuestion, crop?, lat?, lon?, locationSource?, language? }
// language accepts Addis codes (am/om/ti/sid/wal) or legacy display names.
// Response adds { language, regionName, locationSource }.
import { NextRequest, NextResponse } from "next/server";
import {
  SoilVoiceResponse,
  RotationStrategy,
  SoilMood,
  NasaPowerDaily,
  SatellitePreset,
  AudioProvider,
} from "@/lib/types";
import { synthesizeSpeechWithGemini } from "@/lib/audioBuffer";
import { synthesizeAddis, capTextForTts } from "@/lib/addisTts";
import { resolveVoiceForLanguage } from "@/lib/addisVoices";
import { DEFAULT_STRATEGY_WEIGHTS } from "@/lib/strategyScoring";
import {
  CANONICAL_CROPS,
  CanonicalCrop,
  FARMER_INTENTS,
  FarmerIntent,
  cropVerdict,
  inferIntentFromText,
  matchCropFromText,
} from "@/lib/cropIntent";
import {
  AddisLanguageCode,
  isAddisLanguageCode,
  SUPPORTED_LANGUAGES,
} from "@/lib/languageConfig";
import { reverseGeocodeRegion, RegionResult } from "@/lib/region";

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

/** Resolved spoken target: an Addis language code, or legacy en/es. */
type SpokenTarget = AddisLanguageCode | "en" | "es";

function normalizeLanguage(raw: unknown): SpokenTarget {
  if (isAddisLanguageCode(raw)) return raw;
  if (raw === "Amharic") return "am";
  if (raw === "Afaan Oromo") return "om";
  if (raw === "Spanish") return "es";
  return "en";
}

/** Display name used inside Gemini prompts. */
function promptLanguageName(target: SpokenTarget): string {
  if (target === "en") return "English";
  if (target === "es") return "Spanish";
  return SUPPORTED_LANGUAGES[target].promptName;
}

/**
 * Trims a monologue to at most two sentences and appends the hardcoded
 * closing line — in code, never via the LLM. Trimming first keeps the whole
 * result inside the 3-sentence TTS cap so the closing is always spoken.
 */
export function appendClosingLine(script: string, closingLine: string): string {
  const base = (script ?? "").trim();
  if (!base) return closingLine;
  const sentences = base.match(/[^.!?።\n]+[.!?።]*/gu) ?? [base];
  const trimmed = sentences
    .slice(0, 2)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return `${trimmed} ${closingLine}`.trim();
}

function buildPrompt(
  nasaDataSummary: string,
  target: SpokenTarget,
  farmerPriorities: string,
  farmerQuestion?: string
): string {
  const languageName = promptLanguageName(target);
  const questionSection = farmerQuestion
    ? `\n## FARMER QUESTION TO YOU (THE SOIL)\nThe farmer is speaking directly to you and asks: "${farmerQuestion}"\nAnswer this specific question directly in your first-person monologue while citing your live NASA data!\n`
    : "";

  // NOTE: Gemini output quality is weaker for om/ti/sid/wal than for am.
  // When Gemini fails (or returns unusable text) the route falls back to the
  // deterministic per-language template in languageConfig — never to a
  // free-form model guess.
  let scriptRule = "";
  if (target !== "en" && target !== "es") {
    const script = SUPPORTED_LANGUAGES[target].script;
    scriptRule =
      script === "ethiopic"
        ? " The monologue MUST be written in plain Ge'ez (Ethiopic) script only: no markdown, no emojis, and no Latin digits — spell every number out in words."
        : " The monologue MUST be written in plain Latin script only (no Ge'ez characters): no markdown, no emojis, and no digits — spell every number out in words.";
  }

  return `You are an expert agronomist AI fusing satellite remote sensing with ground-level camera imagery. You speak directly AS THE LIVING SOIL.

## GROUND CAMERA IMAGE
The attached image is a 1-cm resolution photograph of the soil surface taken by a farmer's phone camera.
Analyze it for:
1. **Residue cover %** — estimate what percentage of the visible surface is covered by crop residue/mulch vs bare soil.
2. **Surface cracking** — classify as "none", "mild", "moderate", or "severe".
3. **Texture** — note if the soil appears sandy, loamy, clayey, or mixed.

## NASA SATELLITE DATA CONTEXT
${nasaDataSummary}

## FARMER PRIORITIES
${farmerPriorities}
${questionSection}
## REQUIRED OUTPUT — respond in strict JSON (no markdown fences, pure JSON matching this exact structure):
{
  "groundTruthCalibration": {
    "residueCoverPct": 30,
    "surfaceCrackSeverity": "mild",
    "uncertaintyReduction": {
      "satelliteOnlyPct": 34,
      "fusedPct": 11
    }
  },
  "mood": "stressed",
  "firstPersonScript": "A compassionate, practical 2-sentence agricultural monologue spoken directly BY the living soil in ${languageName}. The soil speaks in first person (e.g. 'I am your soil...'). MANDATORY GUIDELINES: 1. NON-TECHNICAL WEATHER & MOISTURE: First, describe what the weather feels like in simple, everyday terms based on the weather context (how the sun has been baking hot, dry winds blowing, and rains absent or scarce). Then state that because of this dry heat, your soil moisture is low deep in your root zone and you feel parched. 2. WATERING BY IRRIGATION: Tell the farmer clearly that because moisture is low, they should water you by irrigation (or furrow/bucket watering) before or after sowing to help crops survive, or sow drought-hardy seeds like chickpeas (Shimbra) or cowpeas, and mulch your surface with crop residue to lock in moisture. 3. STRICTLY NO JARGON: NEVER mention satellite names, orbital sensors, or technical acronyms (NO 'ECOSTRESS', 'SMAP', 'Landsat', 'SRTM', 'NDVI', 'BSI', 'T2M', 'Precip 0.2mm')! Speak with genuine warmth and practical wisdom as the living earth. ${farmerQuestion ? 'Directly and practically answer the farmer question: ' + farmerQuestion : 'Be warm, wise, and practical.'} Do not add any closing advice about consulting an extension agent — that line is appended separately by the system.${scriptRule}",
  "englishSubtitles": "Accurate English translation of the firstPersonScript if language is not English, otherwise identical.",
  "strategies": [
    {
      "name": "Current Baseline",
      "why_suggested": "Detailed explanation of current cropping practice",
      "nasa_evidence": "Specific satellite metrics cited (SMAP root-zone, Landsat NDVI/BSI, ECOSTRESS)",
      "expected_benefits": "Quantified agronomic benefits of baseline",
      "satellite_info_gaps": "What orbital sensors cannot see at 30m-9km resolution",
      "local_expert_risks": "Ground-truth risks requiring agronomist inspection"
    },
    {
      "name": "Bare-Window Bridge Crop",
      "why_suggested": "Why a cover or bridge crop is needed during bare-soil windows",
      "nasa_evidence": "Satellite evidence citing bare-soil erosion months and BSI/NDVI contrast",
      "expected_benefits": "Quantified erosion reduction and organic carbon benefits",
      "satellite_info_gaps": "Specific resolution or revisit gaps orbital platforms face",
      "local_expert_risks": "Local seedling, water competition, and market risks"
    },
    {
      "name": "Hydro-Shield Multi-Year Rotation",
      "why_suggested": "Why a multi-year regenerative rotation system is needed",
      "nasa_evidence": "Multi-year NASA evidence (SRTM slope runoff + ECOSTRESS evaporative stress)",
      "expected_benefits": "Multi-year soil health, moisture retention, and resilience gains",
      "satellite_info_gaps": "Long-term sub-surface dynamics satellites cannot capture",
      "local_expert_risks": "Economic transition hurdles and local crop rotation risks"
    }
  ]
}

Note: For "mood", choose exactly one of: "stressed" (if parched/cracking/exposed), "hopeful" (if cover/bridge practices are active), or "thriving" (if moisture retention and bio-shielding are strong).`;
}

interface ExtractedCropIntent {
  crop: CanonicalCrop | null;
  intent: FarmerIntent;
}

// Cheap single-purpose NLU call. The model only labels the question; the
// agronomic verdict itself is computed later in deterministic code.
async function extractCropIntentWithGemini(
  question: string,
  apiKey: string
): Promise<ExtractedCropIntent | null> {
  const safeQuestion = question.replace(/"{3,}/g, '"').slice(0, 500);
  const prompt = `You extract structured fields from a smallholder farmer's message (it may be in Amharic, Afaan Oromo, Tigrinya, Sidamo, Wolaytta, English, or Spanish).
Return ONLY compact JSON (no markdown fences):
{"crop": <"teff"|"maize"|"chickpea"|"wheat"|"sorghum"|"haricot_bean"|null>, "intent": <"plant_check"|"irrigation"|"cash_income"|"soil_health"|"general">}
Rules:
- crop = the crop the farmer asks about. Map local names: ጤፍ=teff, በቆሎ/boqolloo=maize, ሽምብራ/shimburaa=chickpea, ስንዴ/qamaadii=wheat, ማሽላ/mashilaa=sorghum, ቦለቄ/boleeqe/ፈሰስ=haricot_bean. null if no crop is mentioned.
- intent = "irrigation" if they mention watering/irrigating/river/well/pump; "cash_income" if about profit/selling/money/market; "soil_health" if about cracking/moisture/erosion/fertility; "plant_check" if asking whether/when/what to plant; otherwise "general".
Message: """${safeQuestion}"""`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 128,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const rawText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!rawText) continue;

      const parsed = JSON.parse(
        rawText.replace(/```json\n?|```\n?/g, "").trim()
      ) as { crop?: unknown; intent?: unknown };

      // Schema validation — reject anything outside the declared enums.
      const cropValid =
        parsed.crop === null ||
        (typeof parsed.crop === "string" &&
          (CANONICAL_CROPS as readonly string[]).includes(parsed.crop));
      const intentValid =
        typeof parsed.intent === "string" &&
        (FARMER_INTENTS as readonly string[]).includes(parsed.intent);
      if (!cropValid || !intentValid) continue;

      return {
        crop: (parsed.crop ?? null) as CanonicalCrop | null,
        intent: parsed.intent as FarmerIntent,
      };
    } catch {
      continue;
    }
  }
  return null;
}

interface FinalizeContext {
  target: SpokenTarget;
  preset: Partial<SatellitePreset>;
  latestPower: Partial<NasaPowerDaily>;
  farmerQuestion?: string;
  /** Crop passed explicitly by the client (crop lens chips) — wins over NLU. */
  explicitCrop: CanonicalCrop | null;
  cropIntent: ExtractedCropIntent | null;
}

// Attaches the code-computed verdict, the hardcoded closing line, and runs
// the TTS provider chain. Used for both the Gemini path and the offline
// fallback path so a Gemini outage still yields a voiced template response.
async function attachVerdictAndAudio(
  resp: SoilVoiceResponse,
  ctx: FinalizeContext
): Promise<SoilVoiceResponse> {
  const { target, preset, latestPower, farmerQuestion, explicitCrop, cropIntent } = ctx;
  const addisTarget = isAddisLanguageCode(target) ? target : null;

  if (farmerQuestion || explicitCrop) {
    const crop =
      explicitCrop ??
      cropIntent?.crop ??
      matchCropFromText(farmerQuestion ?? "", addisTarget);
    const intent =
      cropIntent?.intent ?? inferIntentFromText(farmerQuestion ?? "");
    resp.crop = crop;
    resp.intent = intent;
    if (crop) {
      const v = cropVerdict({ crop, intent, preset, latestPower });
      resp.verdict = v.verdict;
      resp.reasons = v.reasons;
      resp.confidence = v.confidence;
    }
  }

  // Hardcoded closing line, appended in code for the supported languages.
  if (addisTarget && resp.firstPersonScript) {
    resp.firstPersonScript = appendClosingLine(
      resp.firstPersonScript,
      SUPPORTED_LANGUAGES[addisTarget].closingLine
    );
  }

  const script = resp.firstPersonScript ?? "";
  let audioBase64: string | null = null;
  let audioProvider: AudioProvider = "none";

  if (script.trim()) {
    if (addisTarget) {
      const voiceId = await resolveVoiceForLanguage(addisTarget);
      if (voiceId) {
        const addis = await synthesizeAddis(script, {
          language: addisTarget,
          voiceId,
        });
        if (addis) {
          audioBase64 = `data:audio/mpeg;base64,${addis.audioBase64}`;
          audioProvider = "addis";
        }
      }
      // No voices listed or synthesis failed → Gemini (am only) / browser.
    }
    if (!audioBase64 && (target === "am" || target === "en" || target === "es")) {
      const geminiAudio = await synthesizeSpeechWithGemini(script);
      if (geminiAudio) {
        audioBase64 = geminiAudio;
        audioProvider = "gemini";
      }
    }
    if (!audioBase64) {
      // Client speaks via speechSynthesis in the active language, then en.
      audioProvider = "browser";
    }
  }

  resp.audioBase64 = audioBase64;
  resp.audioProvider = audioProvider;
  return resp;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageBase64,
      nasaData,
      language = "English",
      farmerPriorities,
      farmerQuestion,
      crop: rawCrop,
      lat: rawLat,
      lon: rawLon,
      locationSource: rawLocationSource,
    } = body;

    const target = normalizeLanguage(language);
    const apiKey = process.env.GEMINI_API_KEY;

    const nd = nasaData ?? {};
    const preset = nd.preset ?? {};
    const lp = nd.latestPower ?? {};

    const explicitCrop: CanonicalCrop | null =
      typeof rawCrop === "string" &&
      (CANONICAL_CROPS as readonly string[]).includes(rawCrop)
        ? (rawCrop as CanonicalCrop)
        : null;

    const lat = Number(rawLat);
    const lon = Number(rawLon);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const locationSource =
      typeof rawLocationSource === "string" &&
      ["live", "saved", "chosen", "demo"].includes(rawLocationSource)
        ? rawLocationSource
        : undefined;

    // Crop/intent extraction + region resolution run in parallel with the
    // main analysis — region is cached server-side after the first lookup.
    const cropIntentPromise: Promise<ExtractedCropIntent | null> =
      farmerQuestion && apiKey
        ? extractCropIntentWithGemini(farmerQuestion, apiKey)
        : Promise.resolve(null);
    const regionPromise: Promise<RegionResult | null> = hasCoords
      ? reverseGeocodeRegion(lat, lon).catch(() => null)
      : Promise.resolve(null);

    const finalize = async (
      resp: SoilVoiceResponse
    ): Promise<SoilVoiceResponse> => {
      const region = await regionPromise;
      const finalized = await attachVerdictAndAudio(resp, {
        target,
        preset,
        latestPower: lp,
        farmerQuestion,
        explicitCrop,
        cropIntent: await cropIntentPromise,
      });
      finalized.language = isAddisLanguageCode(target) ? target : language;
      finalized.regionName = region?.regionName ?? null;
      if (locationSource) finalized.locationSource = locationSource;
      return finalized;
    };

    if (!apiKey) {
      console.warn("GEMINI_API_KEY not configured, using fallback response");
      const fallback = getFallbackResponse(target, preset, farmerQuestion);
      return NextResponse.json(await finalize(fallback));
    }

    // Non-technical weather and soil moisture condition description
    const temp = lp.T2M ?? 22;
    const maxTemp = lp.T2M_MAX ?? 27;
    const precip = lp.PRECTOTCORR ?? 0;
    const rootzoneMoisture = preset.smap_rootzone_mm?.slice(-1)?.[0] ?? 42;

    let weatherSummary = "Warm and dry with clear skies and no rain.";
    if (precip === 0 && temp >= 24) {
      weatherSummary = `Very hot (reaching ${Math.round(maxTemp)}°C) and completely dry, with no rainfall and dry winds baking the ground.`;
    } else if (precip > 0 && precip < 2) {
      weatherSummary = `Hot and dry with only tiny negligible sprinkles (${precip} mm), quickly evaporated by the sun.`;
    } else if (precip >= 2) {
      weatherSummary = `Some rain has fallen (${precip} mm), but warm temperatures continue to dry the surface.`;
    }

    let moistureSummary = "Moisture is low; roots are parched and thirsty. Irrigation is strongly needed if planting.";
    if (rootzoneMoisture < 45) {
      moistureSummary = `Soil moisture is very low (${rootzoneMoisture} mm). Roots are parched and thirsty. Irrigation (or bucket/furrow watering) is necessary for seeds to germinate safely.`;
    } else if (rootzoneMoisture < 75) {
      moistureSummary = `Soil moisture is moderate to low (${rootzoneMoisture} mm). Requires either irrigation or drought-hardy crops like chickpea.`;
    }

    // Build NASA data summary string
    const nasaSummary = `
- Location: ${preset.name ?? "Flagship Field"}
- Coordinates: ${preset.lat ?? 0}, ${preset.lon ?? 0}
- Current Crop: ${preset.crop ?? "Mixed Rainfed"}
- Everyday Weather Condition (Describe this non-technically): ${weatherSummary}
- Soil Moisture Condition (Tell farmer moisture is low and to irrigate): ${moistureSummary}
- Live NASA POWER Weather: Temp ${temp}°C (Max ${maxTemp}°C), Precip ${precip} mm/day, Solar Irradiance ${lp.ALLSKY_SFC_SW_DWN ?? 18} MJ/m²/day, RH ${lp.RH2M ?? 50}%
- Root-Zone Soil Moisture: ${rootzoneMoisture} mm (9 km)
- Evaporative Stress Index (ESI): ${preset.ecostress_esi?.slice(-1)?.[0] ?? 0.28} (70 m)
- Landsat 30 m NDVI Peak: ${Math.max(...(preset.landsat_ndvi ?? [0.75]))}, Fallow NDVI: ${Math.min(...(preset.landsat_ndvi ?? [0.15]))}
- Landsat 30 m Bare Soil Index (BSI) Peak: ${Math.max(...(preset.landsat_bsi ?? [0.72]))}
- Slope: ${preset.srtm_slope_deg ?? 4.2}°, Aspect: ${preset.srtm_aspect_deg ?? 165}°
- Erosion-risk Months: ${(preset.erosion_risk_months ?? [0, 1, 2, 11]).map((i: number) => (preset.months ?? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"])[i]).join(", ")}`;

    const priorityStr = farmerPriorities
      ? `Water Conservation: ${farmerPriorities.waterConservation}/100, Soil Nitrogen: ${farmerPriorities.soilNitrogen}/100, Cash Income: ${farmerPriorities.cashIncome}/100, Livestock Forage: ${farmerPriorities.livestockForage}/100`
      : "Balanced priorities (Water: 70, Nitrogen: 50, Income: 60, Forage: 40)";

    const prompt = buildPrompt(nasaSummary, target, priorityStr, farmerQuestion);

    // Build Gemini request payload
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];

    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 50) {
      parts.unshift({
        inline_data: {
          mime_type: "image/jpeg",
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        },
      });
    }

    const mainAnalysisPromise = (async (): Promise<SoilVoiceResponse | null> => {
      for (const model of GEMINI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const geminiRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
              },
            }),
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.warn(`Model ${model} returned error: ${errText.slice(0, 150)}`);
            continue;
          }

          const geminiData = await geminiRes.json();
          const rawText =
            geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

          if (rawText) {
            const cleaned = rawText.replace(/```json\n?|```\n?/g, "").trim();
            const candidate = JSON.parse(cleaned) as SoilVoiceResponse;
            if (candidate.strategies && candidate.strategies.length === 3) {
              return candidate;
            }
          }
        } catch (err) {
          console.warn(`Attempt with ${model} failed:`, err);
        }
      }
      return null;
    })();

    const [mainParsed] = await Promise.all([
      mainAnalysisPromise,
      cropIntentPromise,
    ]);

    let parsedResult = mainParsed;
    if (!parsedResult) {
      console.warn("Using fallback agronomic response");
      parsedResult = getFallbackResponse(target, preset, farmerQuestion);
    }

    // Attach strategy default weights
    if (parsedResult.strategies) {
      parsedResult.strategies = parsedResult.strategies.map((s) => ({
        ...s,
        weights: s.weights || DEFAULT_STRATEGY_WEIGHTS[s.name],
      })) as [RotationStrategy, RotationStrategy, RotationStrategy];
    }

    // Default mood if not set
    if (!parsedResult.mood) {
      parsedResult.mood = "stressed";
    }

    return NextResponse.json(await finalize(parsedResult));
  } catch (err: unknown) {
    console.error("Soil Voice handler error:", err);
    const fallback = getFallbackResponse("en", {});
    fallback.audioBase64 = null;
    fallback.audioProvider = "none";
    return NextResponse.json(
      fallback,
      { status: 200 } // return 200 with fallback so UI never breaks
    );
  }
}

function getFallbackResponse(
  target: SpokenTarget,
  preset: Record<string, unknown>,
  farmerQuestion?: string
): SoilVoiceResponse {
  const cropName = (preset.crop as string) || "Teff / Maize";
  const questionLower = (farmerQuestion ?? "").toLowerCase();

  let firstPerson =
    "The sun has been baking down hot and dry with no rain, leaving my soil moisture very low deep in my root zone. If you plant now, please water me with irrigation and cover my surface with crop residue mulch to preserve my remaining moisture.";

  if (questionLower.includes("crack")) {
    firstPerson =
      "The scorching heat and dry weather have baked my surface and my soil moisture is very low, causing me to crack open. Please water me by irrigation and spread crop residue mulch so my fissures can heal and stay cool.";
  } else if (
    questionLower.includes("cash") ||
    questionLower.includes("money") ||
    questionLower.includes("profit") ||
    questionLower.includes("sell")
  ) {
    firstPerson =
      "Even though the weather is dry and my moisture is low, you can still earn good cash: water by irrigation and sow drought-hardy chickpeas or cowpeas, which fetch good market income while replenishing my soil.";
  } else if (
    questionLower.includes("water") ||
    questionLower.includes("irrigat") ||
    questionLower.includes("rain")
  ) {
    firstPerson =
      "With the dry skies and no rain falling, my moisture is very low. Giving me water through furrow or drip irrigation right now will ensure your seeds germinate safely.";
  } else if (farmerQuestion) {
    firstPerson = `The weather has been hot and dry, and my soil moisture is low beneath your feet. If you sow ${cropName} or chickpeas now, be sure to water me by irrigation and protect my surface with mulch.`;
  }

  // Deterministic per-language templates — TODO verify with native speakers
  // (languageConfig owns the supported-language copies).
  const scripts: Record<SpokenTarget, { script: string; subtitles: string }> = {
    en: { script: firstPerson, subtitles: firstPerson },
    es: {
      script:
        "El sol ha estado calentando fuerte y seco sin lluvias, dejando mi humedad muy baja en mis raíces. Si vas a sembrar ahora, riégame con riego y cúbreme con rastrojo de cosecha para conservar cada gota de agua.",
      subtitles:
        "The sun has been baking down hot and dry with no rain, leaving my soil moisture very low deep in my roots. If you sow now, please water me with irrigation and cover me with crop residue mulch to preserve every drop of water.",
    },
    am: {
      script: SUPPORTED_LANGUAGES.am.fallbackScript,
      subtitles: SUPPORTED_LANGUAGES.am.fallbackSubtitles,
    },
    om: {
      script: SUPPORTED_LANGUAGES.om.fallbackScript,
      subtitles: SUPPORTED_LANGUAGES.om.fallbackSubtitles,
    },
    ti: {
      script: SUPPORTED_LANGUAGES.ti.fallbackScript,
      subtitles: SUPPORTED_LANGUAGES.ti.fallbackSubtitles,
    },
    sid: {
      script: SUPPORTED_LANGUAGES.sid.fallbackScript,
      subtitles: SUPPORTED_LANGUAGES.sid.fallbackSubtitles,
    },
    wal: {
      script: SUPPORTED_LANGUAGES.wal.fallbackScript,
      subtitles: SUPPORTED_LANGUAGES.wal.fallbackSubtitles,
    },
  };

  const selectedScript = scripts[target] || scripts.en;

  const fallbackStrategies: [RotationStrategy, RotationStrategy, RotationStrategy] = [
    {
      name: "Current Baseline",
      why_suggested: `Maintains existing ${cropName} cultivation cycles familiar to local farm management.`,
      nasa_evidence:
        "SMAP L4 root-zone moisture peaks at 172 mm during rain peaks; Landsat NDVI reaches 0.80 during maturation but collapses to 0.15 in post-harvest fallow.",
      expected_benefits:
        "Predictable traditional yield, proven local seed supply, and established direct-to-market channels.",
      satellite_info_gaps:
        "SMAP 9 km grid cell blends upland hills with valley bottom; Landsat 30 m cannot observe sub-surface hardpan or compaction depths.",
      local_expert_risks:
        "Soil structure breakdown from repeat moldboard tillage; soil organic carbon depletion accelerating without ground-level compost integration.",
      weights: DEFAULT_STRATEGY_WEIGHTS["Current Baseline"],
    },
    {
      name: "Bare-Window Bridge Crop",
      why_suggested:
        "Landsat Bare Soil Index (BSI) surges to 0.78 during the post-harvest dry window, exposing topsoil to catastrophic wind and early rain sheet wash.",
      nasa_evidence:
        "Landsat BSI exceeds 0.70 across Dec-Mar; ECOSTRESS 70 m ESI plummets below 0.30 indicating severe thermal stress and moisture evaporation from unprotected soil.",
      expected_benefits:
        "42% decrease in topsoil sheet erosion; 18-25 kg N/ha biological nitrogen fixation via legume cover; 14 mm higher conserved soil moisture entering main planting.",
      satellite_info_gaps:
        "Orbital 16-day revisit cannot detect rapid germination under sporadic showers; multispectral sensors cannot gauge bridge crop seedbed depth.",
      local_expert_risks:
        "Risk of bridge crop withdrawing residual moisture if dry spell extends; requires seed availability of drought-hardy vetch or cowpea varieties.",
      weights: DEFAULT_STRATEGY_WEIGHTS["Bare-Window Bridge Crop"],
    },
    {
      name: "Hydro-Shield Multi-Year Rotation",
      why_suggested:
        "SRTM topography indicates concentrated slope runoff; shifting to a 3-year phased cereal-legume-deep root sequence creates permanent bio-terracing.",
      nasa_evidence:
        "SRTM 30 m DEM maps 4.2° slope along south-facing aspect generating 38% surface runoff coefficient; multi-year Landsat NDVI reveals declining season-over-season resilience.",
      expected_benefits:
        "55% reduction in cumulative runoff; 0.4% increase in soil organic matter over 36 months; 22% higher drought resilience in dry years.",
      satellite_info_gaps:
        "Satellites cannot quantify mycorrhizal fungal network development or measure micro-pore aggregate stability at sub-meter scales.",
      local_expert_risks:
        "Requires local multi-year farm credit or grain storage infrastructure; marketing channels for alternate rotation crops need local cooperative support.",
      weights: DEFAULT_STRATEGY_WEIGHTS["Hydro-Shield Multi-Year Rotation"],
    },
  ];

  const mood: SoilMood = farmerQuestion?.toLowerCase().includes("cash")
    ? "hopeful"
    : farmerQuestion?.toLowerCase().includes("thriv")
    ? "thriving"
    : "stressed";

  return {
    groundTruthCalibration: {
      residueCoverPct: 28,
      surfaceCrackSeverity: "mild",
      uncertaintyReduction: { satelliteOnlyPct: 34, fusedPct: 11 },
    },
    mood,
    firstPersonScript: selectedScript.script,
    englishSubtitles: selectedScript.subtitles,
    strategies: fallbackStrategies,
    farmerQuestion,
  };
}

// Re-exported for tests (TTS sentence cap shared with the closing-line logic).
export { capTextForTts };

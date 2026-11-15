// ─── /api/soil-voice — Gemini NLU/explanation + code verdict + Addis TTS ───
// Pipeline: (1) Gemini extracts { crop, intent } from the farmer question
// (schema-validated, keyword fallback) → (2) cropVerdict is computed in code,
// never by the LLM → (3) Gemini writes the first-person monologue →
// (4) Amharic audio via Addis AI, Gemini TTS fallback, browser last.
import { NextRequest, NextResponse } from "next/server";
import {
  SoilVoiceResponse,
  Language,
  RotationStrategy,
  SoilMood,
  NasaPowerDaily,
  SatellitePreset,
  AudioProvider,
} from "@/lib/types";
import { synthesizeSpeechWithGemini } from "@/lib/audioBuffer";
import { synthesizeAmharic } from "@/lib/addisTts";
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

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

function buildPrompt(
  nasaDataSummary: string,
  language: Language,
  farmerPriorities: string,
  farmerQuestion?: string
): string {
  const questionSection = farmerQuestion
    ? `\n## FARMER QUESTION TO YOU (THE SOIL)\nThe farmer is speaking directly to you and asks: "${farmerQuestion}"\nAnswer this specific question directly in your first-person monologue while citing your live NASA data!\n`
    : "";

  const amharicScriptRule =
    language === "Amharic"
      ? " The monologue MUST be written in plain Ge'ez (Ethiopic) script only: no markdown, no emojis, and no Latin digits — spell every number out in Amharic words."
      : "";

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
  "firstPersonScript": "A dramatic, scientifically grounded 2-3 sentence monologue spoken BY the soil itself in ${language}. The soil refers to itself in first person (e.g. 'I am the soil'). Cite specific NASA data (SMAP moisture, ECOSTRESS heat, Landsat BSI, etc.). ${farmerQuestion ? 'Directly address the farmer question: ' + farmerQuestion : 'Be emotional and urgent.'}${amharicScriptRule}",
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
  const prompt = `You extract structured fields from a smallholder farmer's message (it may be in Amharic, Afaan Oromo, English, or Spanish).
Return ONLY compact JSON (no markdown fences):
{"crop": <"teff"|"maize"|"chickpea"|"wheat"|"sorghum"|"haricot_bean"|null>, "intent": <"plant_check"|"irrigation"|"cash_income"|"soil_health"|"general">}
Rules:
- crop = the crop the farmer asks about. Map local names: ጤፍ=teff, በቆሎ=maize, ሽምብራ=chickpea, ስንዴ=wheat, ማሽላ=sorghum, ቦለቄ/ፈሰስ=haricot_bean. null if no crop is mentioned.
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
  language: Language;
  preset: Partial<SatellitePreset>;
  latestPower: Partial<NasaPowerDaily>;
  farmerQuestion?: string;
  cropIntent: ExtractedCropIntent | null;
}

// Attaches the code-computed verdict and runs the TTS provider chain.
// Used for both the Gemini path and the offline fallback path so a Gemini
// outage still yields a voiced template response.
async function attachVerdictAndAudio(
  resp: SoilVoiceResponse,
  ctx: FinalizeContext
): Promise<SoilVoiceResponse> {
  const { language, preset, latestPower, farmerQuestion, cropIntent } = ctx;

  if (farmerQuestion) {
    const crop = cropIntent?.crop ?? matchCropFromText(farmerQuestion);
    const intent = cropIntent?.intent ?? inferIntentFromText(farmerQuestion);
    resp.crop = crop;
    resp.intent = intent;
    if (crop) {
      const v = cropVerdict({ crop, intent, preset, latestPower });
      resp.verdict = v.verdict;
      resp.reasons = v.reasons;
      resp.confidence = v.confidence;
    }
  }

  const script = resp.firstPersonScript ?? "";
  let audioBase64: string | null = null;
  let audioProvider: AudioProvider = "none";

  if (script.trim()) {
    if (language === "Amharic") {
      const addis = await synthesizeAmharic(script);
      if (addis) {
        audioBase64 = `data:audio/mpeg;base64,${addis.audioBase64}`;
        audioProvider = "addis";
      }
    }
    if (!audioBase64) {
      const geminiAudio = await synthesizeSpeechWithGemini(script);
      if (geminiAudio) {
        audioBase64 = geminiAudio;
        audioProvider = "gemini";
      }
    }
    if (!audioBase64) {
      // Client speaks via speechSynthesis (am-ET, then en).
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
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    const nd = nasaData ?? {};
    const preset = nd.preset ?? {};
    const lp = nd.latestPower ?? {};

    // Crop/intent extraction runs in parallel with the main analysis.
    const cropIntentPromise: Promise<ExtractedCropIntent | null> =
      farmerQuestion && apiKey
        ? extractCropIntentWithGemini(farmerQuestion, apiKey)
        : Promise.resolve(null);

    if (!apiKey) {
      console.warn("GEMINI_API_KEY not configured, using fallback response");
      const fallback = getFallbackResponse(
        language as Language,
        preset,
        farmerQuestion
      );
      return NextResponse.json(
        await attachVerdictAndAudio(fallback, {
          language: language as Language,
          preset,
          latestPower: lp,
          farmerQuestion,
          cropIntent: await cropIntentPromise,
        })
      );
    }

    // Build NASA data summary string
    const nasaSummary = `
- Location: ${preset.name ?? "Flagship Field"}
- Coordinates: ${preset.lat ?? 0}, ${preset.lon ?? 0}
- Current Crop: ${preset.crop ?? "Mixed Rainfed"}
- Live NASA POWER Weather: Temp ${lp.T2M ?? 20}°C (Max ${lp.T2M_MAX ?? 27}°C), Precip ${lp.PRECTOTCORR ?? 0} mm/day, Solar Irradiance ${lp.ALLSKY_SFC_SW_DWN ?? 18} MJ/m²/day, RH ${lp.RH2M ?? 50}%
- SMAP Root-Zone Soil Moisture: ${preset.smap_rootzone_mm?.slice(-1)?.[0] ?? 42} mm (9 km)
- ECOSTRESS Evaporative Stress Index (ESI): ${preset.ecostress_esi?.slice(-1)?.[0] ?? 0.28} (70 m)
- Landsat 30 m NDVI Peak: ${Math.max(...(preset.landsat_ndvi ?? [0.75]))}, Fallow NDVI: ${Math.min(...(preset.landsat_ndvi ?? [0.15]))}
- Landsat 30 m Bare Soil Index (BSI) Peak: ${Math.max(...(preset.landsat_bsi ?? [0.72]))}
- SRTM 30 m Slope: ${preset.srtm_slope_deg ?? 4.2}°, Aspect: ${preset.srtm_aspect_deg ?? 165}°
- Erosion-risk Months: ${(preset.erosion_risk_months ?? [0, 1, 2, 11]).map((i: number) => (preset.months ?? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"])[i]).join(", ")}`;

    const priorityStr = farmerPriorities
      ? `Water Conservation: ${farmerPriorities.waterConservation}/100, Soil Nitrogen: ${farmerPriorities.soilNitrogen}/100, Cash Income: ${farmerPriorities.cashIncome}/100, Livestock Forage: ${farmerPriorities.livestockForage}/100`
      : "Balanced priorities (Water: 70, Nitrogen: 50, Income: 60, Forage: 40)";

    const prompt = buildPrompt(
      nasaSummary,
      language as Language,
      priorityStr,
      farmerQuestion
    );

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

    const [mainParsed, cropIntent] = await Promise.all([
      mainAnalysisPromise,
      cropIntentPromise,
    ]);

    let parsedResult = mainParsed;
    if (!parsedResult) {
      console.warn("Using fallback agronomic response");
      parsedResult = getFallbackResponse(
        language as Language,
        preset,
        farmerQuestion
      );
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

    return NextResponse.json(
      await attachVerdictAndAudio(parsedResult, {
        language: language as Language,
        preset,
        latestPower: lp,
        farmerQuestion,
        cropIntent,
      })
    );
  } catch (err: unknown) {
    console.error("Soil Voice handler error:", err);
    const fallback = getFallbackResponse("English", {});
    fallback.audioBase64 = null;
    fallback.audioProvider = "none";
    return NextResponse.json(
      fallback,
      { status: 200 } // return 200 with fallback so UI never breaks
    );
  }
}

function getFallbackResponse(
  language: Language,
  preset: Record<string, unknown>,
  farmerQuestion?: string
): SoilVoiceResponse {
  const cropName = (preset.crop as string) || "Teff / Maize";

  let firstPerson =
    "I am the living soil beneath your feet, parched and holding only 42 millimeters of root-zone water according to NASA SMAP. Landsat watches my bare skin scorch under high bare-soil index readings as ECOSTRESS warns of severe evaporative stress. Cover me with living roots before the rains strip away my topsoil forever.";

  if (farmerQuestion) {
    if (farmerQuestion.toLowerCase().includes("crack")) {
      firstPerson =
        "I am cracking because NASA SMAP shows my moisture has dropped to 42 mm, while ECOSTRESS measures an evaporative stress index of 0.28. Without root cover, solar radiation bakes my clay minerals until my surface splits open. Plant a bridge crop now so my fissures can heal.";
    } else if (farmerQuestion.toLowerCase().includes("cash")) {
      firstPerson =
        "You can protect me and still earn cash: an early legume bridge crop like cowpea or chickpea yields high-protein harvest while saving you 30% on synthetic nitrogen fertilizer. NASA Landsat data confirms it will shield my surface before the main planting season.";
    } else {
      firstPerson = `Listening to your question: NASA satellite data confirms my root-zone is under strain with an evaporative index of 0.28. Adopting a bridge crop will stabilize my moisture without interrupting your seasonal ${cropName} rotation.`;
    }
  }

  const scripts: Record<Language, { script: string; subtitles: string }> = {
    English: {
      script: firstPerson,
      subtitles: firstPerson,
    },
    Amharic: {
      script:
        "እኔ ከእግርዎ በታች ያለሁት ህያው አፈር ነኝ፤ በናሳ SMAP መረጃ መሰረት በስሬ የቀረኝ የውሃ መጠን 42 ሚሊሜትር ብቻ ነው። ላንድሳት እርቃኔን በከፍተኛ የባዶ አፈር መረጃ ሲያሳይ፣ ኢኮስትረስ የሙቀት ጭንቀቴን ይመሰክራል። ዝናቡ የላይኛውን ለም አፈሬን ጠራርጎ ከመውሰዱ በፊት በህያው ሰብል ሸፍኑኝ።",
      subtitles:
        "I am the living soil beneath your feet; according to NASA SMAP I hold only 42 mm of root-zone moisture. Landsat reveals my bare skin under intense exposure as ECOSTRESS detects severe heat stress. Cover me with living crops before the rain carries my fertile topsoil away.",
    },
    "Afaan Oromo": {
      script:
        "Ani biyyoo jireenya qabu miila kee jala jiru dha; akka ragaan NASA SMAP agarsiisutti bishaan hidda kootii keessa jiru miliimeetira 42 qofa. Landsat akka qaamni koo qullaa jiru mul'isa, ECOSTRESS ammoo ho'a cimaa akka natti jiru mirkaneessa. Osoo baraan biyyoofi gabbina koo hin dhiqin dura biqiltuun na uffisaa.",
      subtitles:
        "I am the living soil beneath your feet; NASA SMAP data shows my root-zone moisture is down to 42 mm. Landsat exposes my bare ground and ECOSTRESS shows intense heat stress. Clothe me with green cover before torrential rains wash my vitality away.",
    },
    Spanish: {
      script:
        "Soy el suelo vivo bajo sus pies, agrietado y con solo 42 milímetros de humedad radicular según el satélite NASA SMAP. Landsat detecta mi superficie expuesta con un índice de suelo desnudo crítico mientras ECOSTRESS registra un estrés evaporativo severo. Cúbranme con raíces vivas antes de que las lluvias erosionen lo que me queda de vida.",
      subtitles:
        "I am the living soil beneath your feet, cracked and holding only 42 mm of root-zone moisture according to NASA SMAP. Landsat detects critical bare soil exposure while ECOSTRESS logs severe evaporative stress. Cover me with living roots before rainfall erodes my remaining life.",
    },
  };

  const selectedScript = scripts[language] || scripts.English;

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

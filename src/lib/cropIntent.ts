// ─── Farmer Question → Crop / Intent Extraction + Code-Only Crop Verdict ───
// The verdict is computed here in deterministic code from NASA metrics.
// The LLM may extract which crop the farmer asked about, but it NEVER
// decides whether planting is advisable.
import { NasaPowerDaily, SatellitePreset } from "./types";
import {
  AddisLanguageCode,
  isAddisLanguageCode,
  SUPPORTED_LANGUAGES,
} from "./languageConfig";

export const CANONICAL_CROPS = [
  "teff",
  "maize",
  "chickpea",
  "wheat",
  "sorghum",
  "haricot_bean",
] as const;
export type CanonicalCrop = (typeof CANONICAL_CROPS)[number];

export const FARMER_INTENTS = [
  "plant_check",
  "irrigation",
  "cash_income",
  "soil_health",
  "general",
] as const;
export type FarmerIntent = (typeof FARMER_INTENTS)[number];

// TODO verify: Amharic crop glosses below are machine-sourced and must be
// reviewed by a native Amharic speaker before field deployment.
const CROP_KEYWORDS: Record<CanonicalCrop, string[]> = {
  teff: ["ጤፍ", "teff", "tef"],
  maize: ["በቆሎ", "maize", "corn"],
  chickpea: ["ሽምብራ", "chickpea", "chick pea", "shimbra", "shimbura"],
  wheat: ["ስንዴ", "wheat", "sinde"],
  sorghum: ["ማሽላ", "sorghum", "mashila"],
  haricot_bean: ["ቦለቄ", "ፈሰስ", "haricot", "haricot bean", "bean", "beans", "boleqe"],
};

// TODO verify: Amharic intent glosses also need native-speaker review.
const INTENT_KEYWORDS: Record<Exclude<FarmerIntent, "general">, string[]> = {
  irrigation: ["irrigat", "water pump", "river", "well", "ወንዝ", "መስኖ", "watering"],
  cash_income: ["cash", "money", "profit", "sell", "market", "income", "ገንዘብ", "ሽጥ"],
  soil_health: ["crack", "moisture", "erosion", "dry", "fertile", "soil", "አፈር", "ድርቅ"],
  plant_check: ["plant", "sow", "grow", "seed", "crop", "ዘር", "ትከል"],
};

export function matchCropFromText(
  text: string,
  language?: AddisLanguageCode | string | null
): CanonicalCrop | null {
  const lower = (text ?? "").toLowerCase();
  if (!lower) return null;
  // Merge the base (English + Amharic) table with the active language's
  // local crop names. TODO verify non-Amharic glosses (see languageConfig).
  const merged: Record<string, string[]> = {};
  for (const [crop, words] of Object.entries(CROP_KEYWORDS)) {
    merged[crop] = [...words];
  }
  if (language && isAddisLanguageCode(language)) {
    const local = SUPPORTED_LANGUAGES[language].cropNames;
    for (const [crop, words] of Object.entries(local)) {
      merged[crop] = [...(merged[crop] ?? []), ...words];
    }
  }
  // Longest keyword first so "haricot bean" beats "bean".
  const entries = (Object.entries(merged) as [CanonicalCrop, string[]][]).map(
    ([crop, words]) => [crop, [...words].sort((a, b) => b.length - a.length)] as const
  );
  for (const [crop, words] of entries) {
    for (const word of words) {
      if (word && lower.includes(word.toLowerCase())) return crop;
    }
  }
  return null;
}

export function inferIntentFromText(text: string): FarmerIntent {
  const lower = (text ?? "").toLowerCase();
  if (!lower) return "general";
  const ordered: Exclude<FarmerIntent, "general">[] = [
    "irrigation",
    "cash_income",
    "soil_health",
    "plant_check",
  ];
  for (const intent of ordered) {
    if (INTENT_KEYWORDS[intent].some((k) => lower.includes(k.toLowerCase()))) {
      return intent;
    }
  }
  return "general";
}

export type CropVerdictDecision = "plant" | "plant_with_caution" | "wait";
export type VerdictConfidence = "low" | "medium" | "high";

export interface CropVerdictResult {
  verdict: CropVerdictDecision;
  reasons: string[];
  confidence: VerdictConfidence;
}

interface CropProfile {
  label: string;
  waterNeed: "low" | "medium" | "high";
  fixesNitrogen: boolean;
  bridgeCrop: boolean;
}

const CROP_PROFILES: Record<CanonicalCrop, CropProfile> = {
  chickpea: { label: "Chickpea", waterNeed: "low", fixesNitrogen: true, bridgeCrop: true },
  haricot_bean: { label: "Haricot bean", waterNeed: "medium", fixesNitrogen: true, bridgeCrop: true },
  teff: { label: "Teff", waterNeed: "medium", fixesNitrogen: false, bridgeCrop: false },
  wheat: { label: "Wheat", waterNeed: "medium", fixesNitrogen: false, bridgeCrop: false },
  maize: { label: "Maize", waterNeed: "high", fixesNitrogen: false, bridgeCrop: false },
  sorghum: { label: "Sorghum", waterNeed: "low", fixesNitrogen: false, bridgeCrop: false },
};

export interface CropVerdictContext {
  crop: CanonicalCrop;
  intent?: FarmerIntent;
  preset?: Partial<SatellitePreset>;
  latestPower?: Partial<NasaPowerDaily>;
  /** 0 = Jan … 11 = Dec. Defaults to the current month. */
  monthIndex?: number;
}

// Monthly satellite arrays are Jan..Dec — read the evaluated month, falling
// back to the latest available value for short arrays.
function valueForMonth(series: number[] | undefined, month: number): number | null {
  if (!series || series.length === 0) return null;
  return series[month] ?? series[series.length - 1];
}

/**
 * Deterministic agronomic verdict. Pure function of NASA metrics, calendar
 * window, and crop profile — identical inputs always yield the same verdict.
 */
export function cropVerdict({
  crop,
  intent = "general",
  preset,
  latestPower,
  monthIndex,
}: CropVerdictContext): CropVerdictResult {
  const profile = CROP_PROFILES[crop];
  const month = monthIndex ?? new Date().getMonth();
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const erosionMonths = preset?.erosion_risk_months ?? [];
  const inBareWindow = erosionMonths.includes(month);
  const bareWindowStartsNextMonth = erosionMonths.includes((month + 1) % 12);
  const moisture = valueForMonth(preset?.smap_rootzone_mm, month);
  const esi = valueForMonth(preset?.ecostress_esi, month);
  const bsi = preset?.landsat_bsi && preset.landsat_bsi.length > 0
    ? Math.max(...preset.landsat_bsi)
    : null;
  const hasIrrigation = intent === "irrigation";
  const precip = latestPower?.PRECTOTCORR ?? null;

  let score = 50;
  const reasons: string[] = [];

  if (inBareWindow) {
    if (profile.bridgeCrop) {
      score += 20;
      reasons.push(
        `${monthNames[month]} is inside the bare-soil erosion window (Landsat BSI peaks at ${bsi ?? "0.7+"}); a ${profile.label} bridge cover shields exposed topsoil${profile.fixesNitrogen ? " and fixes biological nitrogen" : ""}.`
      );
    } else if (profile.waterNeed === "high" && !hasIrrigation) {
      score -= 15;
      reasons.push(
        `${monthNames[month]} is inside the dry bare-soil window; ${profile.label} has high water demand and rainfed establishment risk is elevated.`
      );
    }
  } else if (bareWindowStartsNextMonth && profile.bridgeCrop) {
    score += 15;
    reasons.push(
      `Bare-soil erosion window opens next month (Landsat BSI climbs toward ${bsi ?? "0.7+"}); sowing ${profile.label} now establishes living cover before exposure peaks.`
    );
  }

  if (moisture !== null) {
    if (moisture < 45) {
      if (profile.waterNeed === "low") {
        score += 10;
        reasons.push(
          `SMAP root-zone moisture is low at ${moisture} mm; drought-hardy ${profile.label} tolerates the deficit.`
        );
      } else if (profile.waterNeed === "high") {
        if (hasIrrigation) {
          score += 5;
          reasons.push(
            `SMAP root-zone moisture is low at ${moisture} mm, but reported river/well irrigation offsets the water deficit for ${profile.label}.`
          );
        } else {
          score -= 10;
          reasons.push(
            `SMAP root-zone moisture is only ${moisture} mm (9 km grid); ${profile.label}'s high water demand is unlikely to be met rainfed.`
          );
        }
      }
    } else if (moisture >= 90 && profile.waterNeed === "high") {
      score += 5;
      reasons.push(
        `SMAP root-zone moisture is abundant at ${moisture} mm, suiting ${profile.label}'s high water demand.`
      );
    }
  }

  if (esi !== null && esi < 0.35) {
    if (profile.waterNeed === "low") {
      score += 5;
      reasons.push(
        `ECOSTRESS evaporative stress index is ${esi} (severe stress); ${profile.label} withstands thermal stress better than alternatives.`
      );
    } else if (profile.waterNeed === "high") {
      if (hasIrrigation) {
        reasons.push(
          `ECOSTRESS evaporative stress index is ${esi}; keep irrigation scheduling tight for ${profile.label}.`
        );
      } else {
        score -= 5;
        reasons.push(
          `ECOSTRESS evaporative stress index is ${esi} (severe stress); ${profile.label} faces elevated transpiration deficit without irrigation.`
        );
      }
    }
  }

  if (precip !== null && precip < 0.5 && profile.waterNeed === "high" && !hasIrrigation) {
    score -= 5;
    reasons.push(
      `NASA POWER daily precipitation is ${precip} mm — effectively dry; rainfed ${profile.label} germination is at risk.`
    );
  }

  if (profile.fixesNitrogen) {
    reasons.push(`${profile.label} fixes biological nitrogen, cutting synthetic fertilizer cost.`);
  }

  const verdict: CropVerdictDecision =
    score >= 60 ? "plant" : score >= 45 ? "plant_with_caution" : "wait";

  const confidence: VerdictConfidence =
    moisture === null && esi === null
      ? "low"
      : intent !== "general"
        ? "high"
        : "medium";

  if (reasons.length === 0) {
    reasons.push(
      `${profile.label} shows no strong satellite-derived contraindication for ${monthNames[month]}; confirm with local agronomist ground-truth.`
    );
  }

  return { verdict, reasons, confidence };
}

// ─── Field Shift AR — Shared Types ───

export interface NasaPowerDaily {
  T2M: number;
  T2M_MAX: number;
  PRECTOTCORR: number;
  ALLSKY_SFC_SW_DWN: number;
  RH2M: number;
  date: string;
}

export interface SatellitePreset {
  id: string;
  name: string;
  lat: number;
  lon: number;
  crop: string;
  region: string;
  smap_rootzone_mm: number[];          // SMAP 9 km root-zone soil moisture (mm)
  ecostress_esi: number[];             // ECOSTRESS 70 m Evaporative Stress Index (0–1)
  landsat_ndvi: number[];              // Landsat 30 m NDVI time-series
  landsat_bsi: number[];               // Landsat 30 m Bare Soil Index time-series
  srtm_slope_deg: number;             // SRTM 30 m slope (degrees)
  srtm_aspect_deg: number;            // SRTM 30 m aspect (degrees)
  months: string[];                    // Month labels for time-series
  erosion_risk_months: number[];       // Indices into months[] flagging bare-window erosion risk
}

export interface FusedFieldData {
  preset: SatellitePreset;
  nasaPower: NasaPowerDaily[];
  latestPower: NasaPowerDaily;
}

export interface GroundTruthCalibration {
  residueCoverPct: number;
  surfaceCrackSeverity: "none" | "mild" | "moderate" | "severe";
  uncertaintyReduction: {
    satelliteOnlyPct: number;
    fusedPct: number;
  };
}

export type SoilMood = "stressed" | "hopeful" | "thriving";

export interface StrategyWeights {
  waterConservation: number; // 0-1
  soilNitrogen: number;      // 0-1
  cashIncome: number;        // 0-1
  livestockForage: number;   // 0-1
}

export interface RotationStrategy {
  name: string;
  why_suggested: string;
  nasa_evidence: string;
  expected_benefits: string;
  satellite_info_gaps: string;
  local_expert_risks: string;
  weights?: StrategyWeights;
  matchScore?: number;       // 0-100% computed from farmer priorities
}

export type AudioProvider = "addis" | "gemini" | "browser" | "none";

export type CropVerdictDecision = "plant" | "plant_with_caution" | "wait";
export type VerdictConfidence = "low" | "medium" | "high";

export interface SoilVoiceResponse {
  groundTruthCalibration: GroundTruthCalibration;
  firstPersonScript: string;
  englishSubtitles: string;
  strategies: [RotationStrategy, RotationStrategy, RotationStrategy];
  audioBase64?: string | null;
  audioProvider?: AudioProvider;
  verdict?: CropVerdictDecision;
  reasons?: string[];
  confidence?: VerdictConfidence;
  crop?: string | null;
  intent?: string;
  mood?: SoilMood;
  farmerQuestion?: string;
  /** Echo of the resolved spoken language (Addis code or legacy name). */
  language?: string;
  /** Region resolved from the farmer's coordinates, when provided. */
  regionName?: string | null;
  /** How the client obtained the coordinates: live | saved | chosen | demo. */
  locationSource?: string;
}

export type Language = "Amharic" | "Afaan Oromo" | "English" | "Spanish";

export interface FarmerPriorities {
  waterConservation: number;   // 0–100
  soilNitrogen: number;        // 0–100
  cashIncome: number;          // 0–100
  livestockForage: number;     // 0–100
}

export type AppMode = "ar" | "inspector";

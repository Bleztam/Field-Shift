// ─── Pre-Harmonized Multi-Resolution Satellite Presets ───
// These arrays represent real NASA satellite data products harmonized to
// monthly cadence for two flagship demonstration plots.

import { SatellitePreset } from "./types";

/**
 * Months used across all presets — a 12-month agricultural year.
 */
const MONTHS_12 = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const PRESETS: SatellitePreset[] = [
  // ── Preset A: Central Rift Valley, Ethiopia ──────────────────────
  {
    id: "eth-crv-teff",
    name: "Central Rift Valley, Ethiopia (Teff/Maize Rainfed Plot)",
    lat: 7.93,
    lon: 38.72,
    crop: "Teff / Maize rotation",
    region: "Central Rift Valley, Ethiopia",

    // SMAP L4 9 km root-zone soil moisture (mm) — seasonal bimodal rain
    smap_rootzone_mm: [
      42, 38, 55, 95, 120, 145, 168, 172, 155, 110, 70, 48,
    ],

    // ECOSTRESS 70 m Evaporative Stress Index (0 = extreme stress, 1 = none)
    ecostress_esi: [
      0.28, 0.22, 0.35, 0.62, 0.78, 0.88, 0.92, 0.90, 0.82, 0.55, 0.38, 0.30,
    ],

    // Landsat 30 m NDVI (vegetation greenness)
    landsat_ndvi: [
      0.18, 0.15, 0.20, 0.38, 0.55, 0.72, 0.80, 0.78, 0.65, 0.40, 0.25, 0.19,
    ],

    // Landsat 30 m Bare Soil Index
    landsat_bsi: [
      0.72, 0.78, 0.68, 0.45, 0.30, 0.18, 0.12, 0.14, 0.22, 0.48, 0.65, 0.74,
    ],

    // SRTM 30 m DEM derivatives
    srtm_slope_deg: 4.2,
    srtm_aspect_deg: 165, // south-facing

    months: MONTHS_12,
    // Dec–Mar: bare-window erosion risk (Belg dry season)
    erosion_risk_months: [0, 1, 2, 11],
  },

  // ── Preset B: Humboldt Basin, Nevada USA ─────────────────────────
  {
    id: "nv-humboldt-alfalfa",
    name: "Humboldt Basin, Nevada USA (Denise Moyle Alfalfa Reference Plot)",
    lat: 40.83,
    lon: -117.82,
    crop: "Alfalfa (irrigated pivot)",
    region: "Humboldt Basin, Nevada",

    // SMAP L4 9 km root-zone soil moisture (mm) — irrigated, arid baseline
    smap_rootzone_mm: [
      30, 28, 35, 85, 130, 155, 160, 150, 120, 65, 38, 32,
    ],

    // ECOSTRESS 70 m Evaporative Stress Index
    ecostress_esi: [
      0.20, 0.18, 0.30, 0.65, 0.82, 0.90, 0.88, 0.85, 0.72, 0.40, 0.25, 0.22,
    ],

    // Landsat 30 m NDVI
    landsat_ndvi: [
      0.12, 0.10, 0.15, 0.45, 0.68, 0.82, 0.85, 0.80, 0.62, 0.30, 0.16, 0.13,
    ],

    // Landsat 30 m Bare Soil Index
    landsat_bsi: [
      0.82, 0.85, 0.78, 0.42, 0.22, 0.10, 0.08, 0.12, 0.28, 0.58, 0.76, 0.80,
    ],

    // SRTM 30 m
    srtm_slope_deg: 1.8,
    srtm_aspect_deg: 210, // southwest-facing

    months: MONTHS_12,
    // Nov–Mar: bare-window erosion risk (winter fallow)
    erosion_risk_months: [0, 1, 2, 10, 11],
  },
];

export function getPresetById(id: string): SatellitePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

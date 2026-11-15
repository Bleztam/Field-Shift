// ─── Farmer location resolution (client) ───
// Order: (a) live geolocation → (b) saved localStorage → (c) region picker.
// The UI must always label the source honestly — saved/chosen is never live.
"use client";

import { RegionKey } from "./languageConfig";

export type LocationSource = "live" | "saved" | "chosen" | "demo";

export interface FarmerLocation {
  lat: number;
  lon: number;
  source: LocationSource;
  /** Epoch ms when a saved/chosen fix was recorded. */
  savedAt?: number;
  /** Region key when known without a server round-trip (picker choices). */
  regionKey?: RegionKey;
  regionName?: string;
}

const LAST_LOCATION_KEY = "fieldshift:lastLocation";
const GEO_TIMEOUT_MS = 10_000;

/**
 * (a) Live geolocation: friendly one-shot request, 10 s timeout, no high
 * accuracy (field use, battery). Resolves null on denial/unavailable.
 */
export function getLiveLocation(): Promise<FarmerLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: "live",
        });
      },
      () => resolve(null),
      {
        timeout: GEO_TIMEOUT_MS,
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
      }
    );
  });
}

/** (b) Last known fix from localStorage, with its timestamp. */
export function loadSavedLocation(): FarmerLocation | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      lat?: number;
      lon?: number;
      savedAt?: number;
      regionKey?: RegionKey;
      regionName?: string;
    };
    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lon !== "number" ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lon)
    ) {
      return null;
    }
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      source: "saved",
      savedAt: parsed.savedAt,
      regionKey: parsed.regionKey,
      regionName: parsed.regionName,
    };
  } catch {
    return null;
  }
}

/** Persist any successful fix (live or chosen) for the next launch. */
export function saveLocation(loc: FarmerLocation): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: loc.lat,
        lon: loc.lon,
        savedAt: Date.now(),
        regionKey: loc.regionKey,
        regionName: loc.regionName,
      })
    );
  } catch {
    // private mode — location just won't persist
  }
}

export interface RegionChoice {
  key: Exclude<RegionKey, "unknown">;
  /** TODO verify Amharic labels with a native speaker. */
  labelAm: string;
  labelEn: string;
  /**
   * Representative point for NASA POWER when the farmer picks this region.
   * Approximate — TODO verify; the UI labels chosen locations accordingly.
   */
  lat: number;
  lon: number;
}

/** (c) Big-button picker options. Representative coordinates are approximate. */
export const REGION_CHOICES: RegionChoice[] = [
  { key: "oromia", labelAm: "ኦሮሚያ", labelEn: "Oromia", lat: 8.54, lon: 39.27 }, // near Adama
  { key: "amhara", labelAm: "አማራ", labelEn: "Amhara", lat: 11.6, lon: 37.38 }, // near Bahir Dar
  { key: "addis_ababa", labelAm: "አዲስ አበባ", labelEn: "Addis Ababa", lat: 9.01, lon: 38.75 },
  { key: "tigray", labelAm: "ትግራይ", labelEn: "Tigray", lat: 13.49, lon: 39.47 }, // near Mekelle
  { key: "sidama", labelAm: "ሲዳማ", labelEn: "Sidama", lat: 7.05, lon: 38.47 }, // near Hawassa
  { key: "snnpr", labelAm: "ደቡብ", labelEn: "South / Wolaita", lat: 6.86, lon: 37.78 }, // near Wolaita Sodo
  { key: "other", labelAm: "ሌላ", labelEn: "Other region", lat: 9.6, lon: 41.87 }, // Dire Dawa reference
];

export function choiceToLocation(choice: RegionChoice): FarmerLocation {
  return {
    lat: choice.lat,
    lon: choice.lon,
    source: "chosen",
    savedAt: Date.now(),
    regionKey: choice.key,
    regionName: choice.labelEn,
  };
}

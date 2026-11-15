// ─── Ethiopian rainy-season helper for the UI season pill (display only) ───

export type SoilSeason = "bega" | "belg" | "kiremt";

export interface SeasonInfo {
  id: SoilSeason;
  labelAm: string;
  labelEn: string;
}

// Bega (dry, Oct–Jan), Belg (short rains, Feb–May), Kiremt (main rains, Jun–Sep).
export function getSeasonForMonth(monthIndex: number): SeasonInfo {
  if (monthIndex >= 5 && monthIndex <= 8) {
    return { id: "kiremt", labelAm: "ክረምት", labelEn: "Kiremt rains" };
  }
  if (monthIndex >= 1 && monthIndex <= 4) {
    return { id: "belg", labelAm: "በልግ", labelEn: "Belg short rains" };
  }
  return { id: "bega", labelAm: "በጋ", labelEn: "Bega dry season" };
}

export function getCurrentSeason(now: Date = new Date()): SeasonInfo {
  return getSeasonForMonth(now.getMonth());
}

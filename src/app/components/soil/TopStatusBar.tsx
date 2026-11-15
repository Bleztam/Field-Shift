"use client";

import React from "react";
import { CloudRain, HelpCircle, MapPin, Sun, CloudSun, WifiOff, Languages } from "lucide-react";
import { SeasonInfo } from "@/lib/soilSeason";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";
import { LocationSource } from "@/lib/location";

interface TopStatusBarProps {
  season: SeasonInfo;
  locationName: string;
  /** Where the coordinates came from — never present saved/chosen as live. */
  locationSource: LocationSource | null;
  onOpenLocation: () => void;
  /** NASA POWER feed live vs preset sample arrays. */
  powerLive: boolean;
  isOnline: boolean;
  languageCode: string;
  onOpenLanguage: () => void;
  showEnglish: boolean;
  onToggleEnglish: () => void;
  onOpenWhy: () => void;
}

const SEASON_ICONS = {
  bega: Sun,
  belg: CloudSun,
  kiremt: CloudRain,
} as const;

const SOURCE_LABEL: Record<LocationSource, string> = {
  live: "live location",
  saved: "saved location",
  chosen: "approximate location",
  demo: "demo plot",
};

export default function TopStatusBar({
  season,
  locationName,
  locationSource,
  onOpenLocation,
  powerLive,
  isOnline,
  languageCode,
  onOpenLanguage,
  showEnglish,
  onToggleEnglish,
  onOpenWhy,
}: TopStatusBarProps) {
  const SeasonIcon = SEASON_ICONS[season.id];
  const sourceLabel = locationSource ? SOURCE_LABEL[locationSource] : "set location";

  return (
    <div className="soil-topbar">
      <span className="soil-pill" title={season.labelEn}>
        <SeasonIcon className="w-4 h-4" style={{ color: "var(--soil-straw)" }} />
        <span className="soil-am" lang="am">{season.labelAm}</span>
      </span>

      <button
        type="button"
        className="soil-pill small"
        onClick={onOpenLocation}
        title={`${sourceLabel} · ${powerLive ? SOIL_STRINGS.liveData.en : SOIL_STRINGS.sampleData.en} — tap to change region`}
      >
        <MapPin className="w-3.5 h-3.5" style={{ color: "var(--soil-straw)" }} />
        <span className="truncate max-w-[96px]">{locationName}</span>
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{
            background:
              locationSource === "live" ? "var(--soil-leaf)" : "var(--soil-amber)",
          }}
          aria-label={sourceLabel}
        />
      </button>

      {!isOnline && (
        <span className="soil-pill small" title={SOIL_STRINGS.offlineTitle.en}>
          <WifiOff className="w-3.5 h-3.5" />
          <span className="soil-am" lang="am">{SOIL_STRINGS.offlineTitle.am}</span>
        </span>
      )}

      <span className="spacer" />

      <button
        type="button"
        className="soil-pill"
        onClick={onOpenLanguage}
        aria-label="Choose spoken language"
        style={{ minWidth: 56, justifyContent: "center" }}
      >
        <Languages className="w-4 h-4" style={{ color: "var(--soil-straw)" }} />
        <span className="font-extrabold tracking-wide uppercase">
          {languageCode}
        </span>
      </button>

      <button
        type="button"
        className="soil-pill"
        onClick={onToggleEnglish}
        aria-pressed={showEnglish}
        aria-label="Toggle English subtitles"
        style={{ minWidth: 56, justifyContent: "center" }}
      >
        <span className="font-extrabold tracking-wide">{showEnglish ? "EN" : "AM"}</span>
      </button>

      <button
        type="button"
        className="soil-pill"
        onClick={onOpenWhy}
        aria-label={SOIL_STRINGS.whyTitle.en}
        style={{ minWidth: 56, justifyContent: "center" }}
      >
        <HelpCircle className="w-5 h-5" />
      </button>
    </div>
  );
}

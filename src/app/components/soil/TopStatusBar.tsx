"use client";

import React from "react";
import { CloudRain, HelpCircle, MapPin, Sun, CloudSun, WifiOff } from "lucide-react";
import { SeasonInfo } from "@/lib/soilSeason";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";

interface TopStatusBarProps {
  season: SeasonInfo;
  locationName: string;
  /** NASA POWER feed live vs preset sample arrays. */
  powerLive: boolean;
  isOnline: boolean;
  showEnglish: boolean;
  onToggleEnglish: () => void;
  onOpenWhy: () => void;
}

const SEASON_ICONS = {
  bega: Sun,
  belg: CloudSun,
  kiremt: CloudRain,
} as const;

export default function TopStatusBar({
  season,
  locationName,
  powerLive,
  isOnline,
  showEnglish,
  onToggleEnglish,
  onOpenWhy,
}: TopStatusBarProps) {
  const SeasonIcon = SEASON_ICONS[season.id];

  return (
    <div className="soil-topbar">
      <span className="soil-pill" title={season.labelEn}>
        <SeasonIcon className="w-4 h-4" style={{ color: "var(--soil-straw)" }} />
        <span className="soil-am" lang="am">{season.labelAm}</span>
      </span>

      <span
        className="soil-pill small"
        title={powerLive ? SOIL_STRINGS.liveData.en : SOIL_STRINGS.sampleData.en}
      >
        <MapPin className="w-3.5 h-3.5" style={{ color: "var(--soil-straw)" }} />
        <span className="truncate max-w-[110px]">{locationName}</span>
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: powerLive ? "var(--soil-leaf)" : "var(--soil-amber)" }}
          aria-label={powerLive ? "live weather" : "sample plot"}
        />
      </span>

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

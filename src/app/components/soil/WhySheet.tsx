"use client";

import React, { useRef } from "react";
import { X, Satellite, Database, Droplets, FlaskConical, ArrowLeftRight } from "lucide-react";
import { FusedFieldData, SoilVoiceResponse } from "@/lib/types";
import { SeasonInfo } from "@/lib/soilSeason";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";
import { VerdictGlyph } from "./icons";

interface WhySheetProps {
  open: boolean;
  onClose: () => void;
  fieldData: FusedFieldData | null;
  soilVoice: SoilVoiceResponse | null;
  season: SeasonInfo;
  presetName: string;
  onSwitchPreset: () => void;
  onOpenInspector: () => void;
}

const CONFIDENCE_PCT = { low: 33, medium: 66, high: 100 } as const;

export default function WhySheet({
  open,
  onClose,
  fieldData,
  soilVoice,
  season,
  presetName,
  onSwitchPreset,
  onOpenInspector,
}: WhySheetProps) {
  const touchStartY = useRef<number | null>(null);

  if (!open) return null;

  const moisture = fieldData?.preset.smap_rootzone_mm?.slice(-1)[0];
  const esi = fieldData?.preset.ecostress_esi?.slice(-1)[0];
  const power = fieldData?.latestPower;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 70) onClose();
    touchStartY.current = null;
  };

  return (
    <>
      <div className="why-sheet-backdrop" onClick={onClose} />
      <section
        className="why-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={SOIL_STRINGS.whyTitle.en}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="why-handle" />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-extrabold">
            <span className="soil-am" lang="am">{SOIL_STRINGS.whyTitle.am}</span>{" "}
            <span className="text-sm font-semibold opacity-60">{SOIL_STRINGS.whyTitle.en}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: "rgba(59,42,32,0.08)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* data provenance */}
        <div className="why-card">
          <h4>{SOIL_STRINGS.liveData.en} / {SOIL_STRINGS.sampleData.en}</h4>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(63,125,58,0.14)", color: "var(--soil-leaf)" }}>
              <Satellite className="w-3.5 h-3.5" />
              NASA POWER — {SOIL_STRINGS.liveData.en}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(201,130,43,0.15)", color: "var(--soil-amber)" }}>
              <Database className="w-3.5 h-3.5" />
              SMAP · ECOSTRESS · Landsat — {SOIL_STRINGS.sampleData.en}
            </span>
          </div>
          {power && (
            <p className="text-xs mt-2 opacity-70">
              {power.date}: {power.T2M.toFixed(1)}°C · {power.PRECTOTCORR.toFixed(1)} mm ·{" "}
              {power.ALLSKY_SFC_SW_DWN.toFixed(1)} MJ/m² · RH {power.RH2M.toFixed(0)}%
            </p>
          )}
        </div>

        {/* season + water */}
        <div className="why-card">
          <h4>{SOIL_STRINGS.seasonLabel.en}</h4>
          <p className="text-sm font-bold">
            <span className="soil-am" lang="am">{season.labelAm}</span>{" "}
            <span className="opacity-60 font-semibold">({season.labelEn})</span>
          </p>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <Droplets className="w-4 h-4" style={{ color: "var(--soil-water)" }} />
            <span className="font-semibold">{SOIL_STRINGS.moistureLabel.en}:</span>
            <span className="font-mono font-bold">{moisture ?? "—"} mm</span>
            <span className="text-xs opacity-60">({SOIL_STRINGS.sampleData.en})</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm">
            <Droplets className="w-4 h-4 opacity-0" />
            <span className="font-semibold">ECOSTRESS ESI:</span>
            <span className="font-mono font-bold">{esi ?? "—"}</span>
            <span className="text-xs opacity-60">({SOIL_STRINGS.sampleData.en})</span>
          </div>
        </div>

        {/* verdict + reasons + confidence */}
        {soilVoice?.verdict && (
          <div className="why-card">
            <h4>{SOIL_STRINGS.reasonsLabel.en}</h4>
            <div className="flex items-center gap-2.5 mb-2">
              <VerdictGlyph verdict={soilVoice.verdict} size={26} />
              <span className="font-extrabold text-base">{soilVoice.verdict.replace(/_/g, " ")}</span>
              {soilVoice.crop && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(63,125,58,0.14)", color: "var(--soil-leaf)" }}>
                  {soilVoice.crop}
                </span>
              )}
            </div>
            {(soilVoice.reasons ?? []).map((reason, i) => (
              <p key={i} className="why-reason">
                <span aria-hidden="true">•</span>
                <span>{reason}</span>
              </p>
            ))}
            {soilVoice.confidence && (
              <div className="mt-3">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>{SOIL_STRINGS.confidenceLabel.en}</span>
                  <span className="soil-am" lang="am">
                    {SOIL_STRINGS.confidenceLabel.am} — {soilVoice.confidence}
                  </span>
                </div>
                <div className="confidence-track">
                  <div
                    className="confidence-fill"
                    style={{ width: `${CONFIDENCE_PCT[soilVoice.confidence]}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* confirm with local agent */}
        <div className="why-card" style={{ background: "rgba(46,134,171,0.08)", borderColor: "rgba(46,134,171,0.25)" }}>
          <p className="soil-am text-[15px] font-semibold leading-relaxed" lang="am">
            {SOIL_STRINGS.confirmAgent.am}
          </p>
          <p className="text-xs mt-1 opacity-70">{SOIL_STRINGS.confirmAgent.en}</p>
        </div>

        {/* judge / demo utilities */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onOpenInspector}
            className="inline-flex items-center gap-1.5 text-xs font-bold opacity-70 underline underline-offset-2 py-3"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {SOIL_STRINGS.judgeInspector.en}
          </button>
          <button
            type="button"
            onClick={onSwitchPreset}
            className="inline-flex items-center gap-1.5 text-xs font-bold opacity-70 py-3"
            title={presetName}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {presetName.includes("Ethiopia") ? "Rift Valley" : "Nevada"} ⇄
          </button>
        </div>
      </section>
    </>
  );
}

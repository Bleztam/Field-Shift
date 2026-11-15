"use client";

import React from "react";
import { Camera } from "lucide-react";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";

interface PermissionPrimerProps {
  /** Fired when the farmer dismisses the primer (either button). */
  onDone: () => void;
}

/**
 * First-launch permission primer: one big icon, short AM+EN copy, one primary
 * button. The camera is always attempted once the primer is dismissed — the
 * browser permission prompt is the real gate, and a denial gracefully keeps
 * the illustrated field as the backdrop.
 */
export default function PermissionPrimer({ onDone }: PermissionPrimerProps) {
  return (
    <div className="primer-backdrop" role="dialog" aria-modal="true" aria-label={SOIL_STRINGS.primerTitle.en}>
      <div className="primer-card">
        <div className="big-icon">
          <Camera className="w-10 h-10" style={{ color: "var(--soil-sienna)" }} />
        </div>
        <h2 lang="am">{SOIL_STRINGS.primerTitle.am}</h2>
        <p>
          <span className="soil-am block mb-2" lang="am">
            {SOIL_STRINGS.primerBody.am}
          </span>
          {SOIL_STRINGS.primerBody.en}
        </p>
        <button
          type="button"
          className="primer-button"
          onClick={() => onDone()}
        >
          <span className="soil-am" lang="am">{SOIL_STRINGS.primerAllow.am}</span>
          {" · "}
          {SOIL_STRINGS.primerAllow.en}
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="mt-3 text-sm font-bold underline underline-offset-4 opacity-70 py-2 px-4"
        >
          <span className="soil-am" lang="am">{SOIL_STRINGS.primerSkip.am}</span>
          {" · "}
          {SOIL_STRINGS.primerSkip.en}
        </button>
      </div>
    </div>
  );
}

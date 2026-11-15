"use client";

import React from "react";
import { Camera } from "lucide-react";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";

interface PermissionPrimerProps {
  /** allow=true → mount camera; false → continue with illustrated ground. */
  onDone: (allowCamera: boolean) => void;
}

/**
 * First-launch permission primer: one big icon, short AM+EN copy, one primary
 * button. Skipping is graceful — the illustrated field becomes the backdrop.
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
          onClick={() => onDone(true)}
        >
          <span className="soil-am" lang="am">{SOIL_STRINGS.primerAllow.am}</span>
          {" · "}
          {SOIL_STRINGS.primerAllow.en}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
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

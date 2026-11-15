"use client";

import React from "react";
import { CropVerdictDecision } from "@/lib/types";
import { VERDICT_STRINGS } from "@/lib/soilUiStrings";
import { VerdictGlyph } from "./icons";

interface VerdictBadgeProps {
  verdict: CropVerdictDecision;
  cropLabelAm?: string;
}

/** Big icon + shape + Amharic text verdict — never color alone. */
export default function VerdictBadge({ verdict, cropLabelAm }: VerdictBadgeProps) {
  const strings = VERDICT_STRINGS[verdict];
  return (
    <div className="verdict-badge" role="status" aria-live="polite">
      <VerdictGlyph verdict={verdict} />
      <div className="flex flex-col leading-tight">
        <span className="am" lang="am">
          {cropLabelAm ? `${cropLabelAm} — ${strings.am}` : strings.am}
        </span>
        <span className="en">{strings.en}</span>
      </div>
    </div>
  );
}

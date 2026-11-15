"use client";

import React, { useRef, useState } from "react";
import { Keyboard, Mic } from "lucide-react";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";

interface PushToTalkProps {
  held: boolean;
  micLevels: number[];
  srSupported: boolean;
  disabled?: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onOpenText: () => void;
}

/**
 * Big ≥80px hold-to-talk button. When SpeechRecognition is missing the mic
 * button still works for the hold gesture, and the keyboard affordance opens
 * the text tray — the crop chips remain the primary path either way.
 */
export default function PushToTalk({
  held,
  micLevels,
  srSupported,
  disabled,
  onHoldStart,
  onHoldEnd,
  onOpenText,
}: PushToTalkProps) {
  const [pointerHeld, setPointerHeld] = useState(false);
  const heldRef = useRef(false);

  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    heldRef.current = true;
    setPointerHeld(true);
    onHoldStart();
  };
  const end = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setPointerHeld(false);
    onHoldEnd();
  };

  const isHeld = held || pointerHeld;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* audio-level visualizer while listening */}
      <div className="ptt-levels" aria-hidden="true" style={{ opacity: isHeld ? 1 : 0 }}>
        {micLevels.map((lvl, i) => (
          <span key={i} style={{ height: `${4 + lvl * 30}px` }} />
        ))}
      </div>

      <div className="ptt-row">
        {/* keyboard fallback / text entry */}
        <button
          type="button"
          className="ptt-side"
          onClick={onOpenText}
          aria-label={srSupported ? "Type a question instead" : "Type a question (voice not supported)"}
          title={SOIL_STRINGS.typePlaceholder.en}
        >
          <Keyboard className="w-6 h-6" />
        </button>

        <button
          type="button"
          className={`ptt-button ${isHeld ? "held" : ""}`}
          onPointerDown={start}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          onContextMenu={(e) => e.preventDefault()}
          disabled={disabled}
          aria-label={SOIL_STRINGS.pttHint.en}
        >
          <Mic className="w-9 h-9" strokeWidth={2.4} />
        </button>

        {/* symmetric spacer keeps PTT centered */}
        <div className="ptt-side" style={{ visibility: "hidden" }} aria-hidden="true" />
      </div>

      <p className="ptt-hint soil-am" lang="am">
        {SOIL_STRINGS.pttHint.am}
        <span className="sr-only">{SOIL_STRINGS.pttHint.en}</span>
      </p>
    </div>
  );
}

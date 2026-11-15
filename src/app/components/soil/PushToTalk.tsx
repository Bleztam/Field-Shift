"use client";

import React, { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Square } from "lucide-react";
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
 * Big ≥80px push-to-talk button supporting both:
 * 1. Press-and-Hold: Farmer holds the button while speaking and releases to send.
 * 2. Tap-to-Talk (Toggle): Farmer taps once to start recording hands-free, and taps again to send.
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
  const [isToggled, setIsToggled] = useState(false);
  const heldRef = useRef(false);
  const isToggledRef = useRef(false);
  const downTimeRef = useRef(0);

  // Sync state if conversation engine resets to idle or thinking
  useEffect(() => {
    if (!held) {
      heldRef.current = false;
      isToggledRef.current = false;
      setPointerHeld(false);
      setIsToggled(false);
    }
  }, [held]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();

    // Try capturing pointer so sliding touch doesn't cancel recording
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // If currently in tap-to-talk toggle mode, this click stops recording and submits
    if (isToggledRef.current) {
      isToggledRef.current = false;
      heldRef.current = false;
      setIsToggled(false);
      setPointerHeld(false);
      onHoldEnd();
      return;
    }

    downTimeRef.current = Date.now();
    heldRef.current = true;
    setPointerHeld(true);
    onHoldStart();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!heldRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const duration = Date.now() - downTimeRef.current;
    if (duration < 380) {
      // Short tap: switch into locked recording mode so the farmer can speak hands-free
      isToggledRef.current = true;
      setIsToggled(true);
      setPointerHeld(true);
    } else {
      // Long press release: finish recording
      heldRef.current = false;
      isToggledRef.current = false;
      setIsToggled(false);
      setPointerHeld(false);
      onHoldEnd();
    }
  };

  const handlePointerCancel = () => {
    if (isToggledRef.current) return; // keep toggle active
    if (!heldRef.current) return;
    heldRef.current = false;
    setPointerHeld(false);
    onHoldEnd();
  };

  const isHeld = held || pointerHeld || isToggled;

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
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          disabled={disabled}
          aria-label={isToggled ? "Tap to finish speaking" : SOIL_STRINGS.pttHint.en}
          aria-pressed={isHeld}
        >
          {isToggled ? (
            <Square className="w-8 h-8 fill-current text-amber-200" />
          ) : (
            <Mic className="w-9 h-9" strokeWidth={2.4} />
          )}
        </button>

        {/* symmetric spacer keeps PTT centered */}
        <div className="ptt-side" style={{ visibility: "hidden" }} aria-hidden="true" />
      </div>

      <p className="ptt-hint soil-am" lang="am">
        {isToggled ? (
          <>
            እያዳመጥኩ ነው… ለመጨረስ ይጫኑ
            <span className="sr-only"> · Tap to finish</span>
          </>
        ) : (
          <>
            {SOIL_STRINGS.pttHint.am}
            <span className="sr-only">{SOIL_STRINGS.pttHint.en}</span>
          </>
        )}
      </p>
    </div>
  );
}

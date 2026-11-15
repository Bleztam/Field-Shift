"use client";

import React, { useEffect, useMemo, useState } from "react";

interface SoilCaptionsProps {
  amharic: string;
  english: string;
  /** Word-by-word reveal while the soil is speaking. */
  speaking: boolean;
  /** EN subtitle visibility (top-bar toggle). */
  showEnglish: boolean;
  onTap?: () => void;
}

const WORD_INTERVAL_MS = 230;

export default function SoilCaptions({
  amharic,
  english,
  speaking,
  showEnglish,
  onTap,
}: SoilCaptionsProps) {
  const words = useMemo(() => amharic.split(/\s+/).filter(Boolean), [amharic]);
  const [shownCount, setShownCount] = useState(words.length);

  // Reset reveal when the text changes; idle text is fully visible at once.
  useEffect(() => {
    setShownCount(speaking ? 0 : words.length);
  }, [amharic, speaking, words.length]);

  useEffect(() => {
    if (!speaking || shownCount >= words.length) return;
    const timer = setTimeout(
      () => setShownCount((c) => Math.min(words.length, c + 1)),
      WORD_INTERVAL_MS
    );
    return () => clearTimeout(timer);
  }, [speaking, shownCount, words.length]);

  return (
    <div className="soil-captions">
      <button
        type="button"
        className="soil-bubble"
        onClick={onTap}
        aria-label="Soil message"
      >
        <p className="am" lang="am">
          {words.map((w, i) => (
            <span key={`${i}-${w}`} className={`word ${i < shownCount ? "shown" : ""}`}>
              {w}
            </span>
          ))}
        </p>
        {showEnglish && english && (
          <p className="en" lang="en">
            {english}
          </p>
        )}
      </button>
    </div>
  );
}

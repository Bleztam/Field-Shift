"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SoilMood } from "@/lib/types";
import { MoodGlyph } from "./icons";

export type SoilUiState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "offline"
  | "error";

interface SoilFaceProps {
  mood: SoilMood;
  uiState: SoilUiState;
  /** 0..1 audio amplitude driving the mouth (timed wave for browser TTS). */
  mouthLevel: number;
  onTap?: () => void;
}

const MOUND: Record<SoilMood, { base: string; light: string }> = {
  stressed: { base: "#7d6046", light: "#96795a" }, // dry, desaturated
  hopeful: { base: "#5a4433", light: "#705740" }, // damp, cool
  thriving: { base: "#4e3a2a", light: "#644b35" }, // rich loam
};

const BROW_PATHS: Record<SoilMood, { left: string; right: string }> = {
  stressed: { left: "M 96 104 L 138 117", right: "M 224 104 L 182 117" }, // furrowed
  hopeful: { left: "M 96 113 Q 118 100 140 110", right: "M 224 113 Q 202 100 180 110" }, // arched
  thriving: { left: "M 96 110 Q 118 105 140 109", right: "M 224 110 Q 202 105 180 109" }, // relaxed
};

function mouthPath(mood: SoilMood, level: number): string {
  const cx = 160;
  const cy = 178;
  const w = 30;
  const smile = mood === "stressed" ? -7 : mood === "hopeful" ? 6 : 11;
  const open = 1.5 + Math.min(1, Math.max(0, level)) * 20;
  return `M ${cx - w} ${cy} Q ${cx} ${cy + smile + open} ${cx + w} ${cy} Q ${cx} ${
    cy + smile - open * 0.45
  } ${cx - w} ${cy} Z`;
}

export default function SoilFace({ mood, uiState, mouthLevel, onTap }: SoilFaceProps) {
  const pupilsRef = useRef<SVGGElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const [giggling, setGiggling] = useState(false);
  const [puffs, setPuffs] = useState<number[]>([]);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Light eye-follow of touch/pointer; gaze drops while thinking.
  useEffect(() => {
    if (prefersReducedMotion) return;

    const onPointer = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      targetRef.current = {
        x: Math.max(-6, Math.min(6, nx * 12)),
        y: Math.max(-4, Math.min(5, ny * 9)),
      };
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });

    const tick = () => {
      const target =
        uiState === "thinking" ? { x: 0, y: 5 } : targetRef.current;
      const cur = currentRef.current;
      cur.x += (target.x - cur.x) * 0.12;
      cur.y += (target.y - cur.y) * 0.12;
      pupilsRef.current?.setAttribute(
        "transform",
        `translate(${cur.x.toFixed(2)} ${cur.y.toFixed(2)})`
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [uiState, prefersReducedMotion]);

  const handleTap = () => {
    if (giggling) return;
    setGiggling(true);
    setPuffs((p) => [...p, Date.now()]);
    setTimeout(() => setGiggling(false), 480);
    onTap?.();
  };

  const colors = MOUND[mood];
  const layerOpacity = (m: SoilMood) => (m === mood ? 1 : 0);

  return (
    <div
      className={[
        "soil-face-wrap",
        uiState === "listening" ? "listening" : "",
        uiState === "offline" ? "offline-dim" : "",
        giggling ? "giggle" : "",
      ].join(" ")}
      onClick={handleTap}
      role="img"
      aria-label={`The soil character, feeling ${mood}`}
    >
      {/* idle dust motes + one wandering insect */}
      {uiState === "idle" && !prefersReducedMotion && (
        <>
          {[18, 38, 55, 72, 86].map((left, i) => (
            <span
              key={left}
              className="soil-dust"
              style={{
                left: `${left}%`,
                bottom: `${30 + (i % 3) * 12}%`,
                animationDelay: `${i * 1.15}s`,
                animationDuration: `${5.2 + (i % 3)}s`,
              }}
            />
          ))}
          <span className="soil-insect" style={{ left: "70%", bottom: "52%" }} />
        </>
      )}

      {/* listening ripples */}
      {uiState === "listening" && !prefersReducedMotion && (
        <>
          <span className="soil-ripple" />
          <span className="soil-ripple" style={{ animationDelay: "0.9s" }} />
        </>
      )}

      {/* tap dust puffs */}
      {puffs.map((id, i) => (
        <span
          key={id}
          className="soil-puff"
          style={{ left: `${30 + (i % 3) * 20}%` }}
          onAnimationEnd={() =>
            setPuffs((p) => p.filter((x) => x !== id))
          }
        />
      ))}

      <svg
        viewBox="0 0 320 240"
        className={`soil-breathe ${uiState === "thinking" ? "thinking" : ""}`}
        style={{ ["--mound-base" as string]: colors.base }}
      >
        {/* soft ground shadow */}
        <ellipse cx="160" cy="232" rx="150" ry="14" fill="rgba(30,20,15,0.35)" />

        {/* mound body */}
        <path
          className="soil-mood-layer"
          d="M 12 240 Q 18 92 160 84 Q 302 92 308 240 Z"
          fill={colors.base}
        />
        <path
          className="soil-mood-layer"
          d="M 60 160 Q 90 104 160 100 Q 230 104 260 160 Q 220 132 160 130 Q 100 132 60 160 Z"
          fill={colors.light}
          opacity="0.55"
        />
        {/* soil grain texture */}
        {[
          [70, 200], [110, 216], [150, 206], [205, 218], [250, 202], [95, 176], [228, 178],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.4 + (i % 2)} fill={colors.light} opacity="0.5" />
        ))}

        {/* stressed: crack fissures */}
        <g
          className="soil-mood-layer"
          opacity={layerOpacity("stressed")}
          stroke="#3B2A20"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M 46 218 l 12 -14 l -5 -12 l 13 -12" opacity="0.55" />
          <path d="M 274 218 l -12 -14 l 5 -12 l -13 -12" opacity="0.55" />
          <path d="M 130 232 l 8 -10 l -3 -9 l 10 -9" opacity="0.4" />
        </g>

        {/* hopeful: water ripples + drop */}
        <g
          className="soil-mood-layer"
          opacity={layerOpacity("hopeful")}
          fill="none"
          stroke="#2E86AB"
          strokeLinecap="round"
        >
          <path d="M 40 214 Q 160 236 280 214" strokeWidth="3" opacity="0.55" />
          <path d="M 74 226 Q 160 242 246 226" strokeWidth="2.4" opacity="0.4" />
          <path
            d="M 252 118 q 8 10 8 14 a 8 8 0 1 1 -16 0 q 0 -4 8 -14 Z"
            fill="#2E86AB"
            stroke="none"
            opacity="0.85"
          />
        </g>

        {/* thriving: sprouts */}
        <g
          className="soil-mood-layer"
          opacity={layerOpacity("thriving")}
          strokeLinecap="round"
        >
          {[
            { x: 74, y: 104, s: 1 },
            { x: 160, y: 92, s: 1.15 },
            { x: 246, y: 104, s: 1 },
          ].map(({ x, y, s }, i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path d="M 0 0 V -12" stroke="#3F7D3A" strokeWidth="3" />
              <path d="M 0 -12 q -8 -1 -9 -9 q 9 0 9 9 Z" fill="#3F7D3A" />
              <path d="M 0 -12 q 8 -1 9 -9 q -9 0 -9 9 Z" fill="#7FB069" />
            </g>
          ))}
        </g>

        {/* brows */}
        {(Object.keys(BROW_PATHS) as SoilMood[]).map((m) => (
          <g
            key={m}
            className="soil-mood-layer"
            opacity={layerOpacity(m)}
            stroke="#3B2A20"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          >
            <path d={BROW_PATHS[m].left} />
            <path d={BROW_PATHS[m].right} />
          </g>
        ))}

        {/* eyes */}
        {[
          { cx: 118, cy: 132 },
          { cx: 202, cy: 132 },
        ].map(({ cx, cy }, i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx="24" ry="27" fill="#FFF8EC" />
            <ellipse
              className="soil-eyelid soil-mood-layer"
              cx={cx}
              cy={cy}
              rx="25"
              ry="28"
              fill="var(--mound-base)"
              style={{ animationDelay: i === 0 ? "0s" : "0.06s" }}
            />
          </g>
        ))}
        <g ref={pupilsRef}>
          <circle cx="118" cy="134" r="10.5" fill="#3B2A20" />
          <circle cx="202" cy="134" r="10.5" fill="#3B2A20" />
          <circle cx="114.5" cy="130" r="3.2" fill="#FFF8EC" opacity="0.9" />
          <circle cx="198.5" cy="130" r="3.2" fill="#FFF8EC" opacity="0.9" />
        </g>

        {/* mouth — amplitude-driven */}
        <path d={mouthPath(mood, uiState === "speaking" ? mouthLevel : 0.04)} fill="#2A1A12" />
        {uiState === "speaking" && mouthLevel > 0.35 && (
          <ellipse cx="160" cy={184 + mouthLevel * 6} rx="12" ry={3 + mouthLevel * 4} fill="rgba(227,199,122,0.35)" />
        )}
      </svg>

      {/* mood glyph chip (icon, not color alone) */}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          right: "6%",
          bottom: "20%",
          width: 40,
          height: 40,
          background: "rgba(30,20,15,0.55)",
          border: "1px solid rgba(255,248,236,0.2)",
        }}
      >
        <MoodGlyph mood={mood} size={22} />
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { SoilMood } from "@/lib/types";

/* Small hand-drawn SVG glyphs — no asset downloads, <2KB total. */

export function CropGlyph({ id, size = 30 }: { id: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-hidden": true as const,
  };
  const straw = "#E3C77A";
  const leaf = "#7FB069";
  const grain = "#C9822B";

  switch (id) {
    case "teff": // fine many-seed spray
      return (
        <svg {...common}>
          <path d="M16 28 V12" stroke={leaf} strokeWidth="2.4" strokeLinecap="round" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <path
                d={`M16 ${12 + i * 2} q ${-6 - i} ${-2 - i * 2} ${-9 - i} ${-6 - i * 2}`}
                stroke={straw}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d={`M16 ${12 + i * 2} q ${6 + i} ${-2 - i * 2} ${9 + i} ${-6 - i * 2}`}
                stroke={straw}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>
      );
    case "maize": // cob with husk
      return (
        <svg {...common}>
          <ellipse cx="16" cy="14" rx="6" ry="9" fill={grain} />
          {[10, 14, 18].map((y) => (
            <path key={y} d={`M11 ${y} h10`} stroke="#8a5a1d" strokeWidth="1.4" />
          ))}
          <path d="M9 20 q-4 6 1 9 M23 20 q4 6 -1 9" stroke={leaf} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "chickpea": // pod with two peas
      return (
        <svg {...common}>
          <path d="M8 22 q8 -18 16 0 q-8 6 -16 0 Z" fill={leaf} />
          <circle cx="14" cy="18" r="3.2" fill={straw} />
          <circle cx="19.5" cy="17" r="3.2" fill={straw} />
        </svg>
      );
    case "wheat": // classic ear
      return (
        <svg {...common}>
          <path d="M16 28 V10" stroke={grain} strokeWidth="2.2" strokeLinecap="round" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse cx="12.6" cy={9 + i * 4} rx="3.4" ry="2" fill={straw} transform={`rotate(-28 12.6 ${9 + i * 4})`} />
              <ellipse cx="19.4" cy={9 + i * 4} rx="3.4" ry="2" fill={straw} transform={`rotate(28 19.4 ${9 + i * 4})`} />
            </g>
          ))}
          <path d="M16 8 l0 -4 M13 9 l-2 -3 M19 9 l2 -3" stroke={straw} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "sorghum": // dense panicle head
      return (
        <svg {...common}>
          <path d="M16 28 V14" stroke={leaf} strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="16" cy="9" rx="6.5" ry="7" fill="#B06A3B" />
          {[-3, 0, 3].map((dx) =>
            [-2, 1, 4].map((dy) => (
              <circle key={`${dx}${dy}`} cx={16 + dx} cy={7 + dy} r="1.3" fill={straw} />
            ))
          )}
        </svg>
      );
    case "haricot": // climbing bean with pods
      return (
        <svg {...common}>
          <path d="M10 28 q-3 -12 6 -16 q10 -4 8 6" stroke={leaf} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M20 18 q5 1 4 6 q-5 1 -6 -4 q1 -3 2 -2 Z" fill={straw} />
          <path d="M12 22 q4 2 3 6 q-5 0 -5 -4 q1 -2 2 -2 Z" fill={straw} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M16 26 V14 M16 14 q-6 -2 -7 -8 q7 0 7 8 Z M16 14 q6 -2 7 -8 q-7 0 -7 8 Z" stroke={leaf} strokeWidth="2" fill={leaf} />
        </svg>
      );
  }
}

export function MoodGlyph({ mood, size = 18 }: { mood: SoilMood; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  if (mood === "stressed") {
    // sun + crack
    return (
      <svg {...common}>
        <circle cx="12" cy="10" r="5" fill="#E3C77A" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line
            key={a}
            x1={12 + 6.6 * Math.cos((a * Math.PI) / 180)}
            y1={10 + 6.6 * Math.sin((a * Math.PI) / 180)}
            x2={12 + 8.6 * Math.cos((a * Math.PI) / 180)}
            y2={10 + 8.6 * Math.sin((a * Math.PI) / 180)}
            stroke="#E3C77A"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ))}
        <path d="M9 20 l2 -2 2 2 2 -2" stroke="#A0522D" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (mood === "hopeful") {
    // water drop
    return (
      <svg {...common}>
        <path d="M12 3 q7 9 7 13 a7 7 0 1 1 -14 0 q0 -4 7 -13 Z" fill="#2E86AB" />
        <circle cx="9.5" cy="15.5" r="1.8" fill="#FFF8EC" opacity="0.7" />
      </svg>
    );
  }
  // thriving — sprout
  return (
    <svg {...common}>
      <path d="M12 21 V11" stroke="#3F7D3A" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 11 q-7 -1 -8 -8 q8 0 8 8 Z" fill="#3F7D3A" />
      <path d="M12 11 q7 -1 8 -8 q-8 0 -8 8 Z" fill="#7FB069" />
    </svg>
  );
}

export function VerdictGlyph({
  verdict,
  size = 30,
}: {
  verdict: "plant" | "plant_with_caution" | "wait";
  size?: number;
}) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const };
  if (verdict === "plant") {
    // circle + check (distinct shape)
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="14" fill="#3F7D3A" />
        <path d="M9.5 16.5 l4.5 4.5 l8.5 -9" stroke="#FFF8EC" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (verdict === "plant_with_caution") {
    // triangle + exclamation (distinct shape)
    return (
      <svg {...common}>
        <path d="M16 4 L30 27 H2 Z" fill="#C9822B" strokeLinejoin="round" />
        <rect x="14.6" y="12" width="2.8" height="8" rx="1.4" fill="#3B2A20" />
        <circle cx="16" cy="23.4" r="1.8" fill="#3B2A20" />
      </svg>
    );
  }
  // octagon + pause bars (distinct shape)
  return (
    <svg {...common}>
      <path d="M10 3 h12 l7 7 v12 l-7 7 h-12 l-7 -7 v-12 Z" fill="#A0522D" />
      <rect x="11" y="10" width="3.6" height="12" rx="1.6" fill="#FFF8EC" />
      <rect x="17.4" y="10" width="3.6" height="12" rx="1.6" fill="#FFF8EC" />
    </svg>
  );
}

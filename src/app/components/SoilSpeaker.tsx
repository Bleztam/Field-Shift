"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface SoilSpeakerProps {
  script: string;
  subtitles: string;
  language: string;
  isPlaying: boolean;
  frequencyData?: number[];
  onToggle: () => void;
}

export default function SoilSpeaker({
  script: _script,
  subtitles,
  language: _language,
  isPlaying,
  frequencyData,
  onToggle,
}: SoilSpeakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // ── Audio waveform visualization ──
  const drawWaveform = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      ctx.clearRect(0, 0, w, h);

      if (!isPlaying) {
        // Idle state — subtle resting line
        ctx.strokeStyle = "rgba(180, 110, 45, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const midY = h / 2;
        for (let x = 0; x < w; x++) {
          const y = midY + Math.sin(x * 0.05 + t * 0.002) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      // Live 16-bar frequency data or simulated fallback
      const barsCount = frequencyData && frequencyData.length === 16 ? 16 : 32;
      const barW = Math.max(3, (w - barsCount * 3) / barsCount);

      for (let i = 0; i < barsCount; i++) {
        let barH = 4;
        if (frequencyData && frequencyData.length === 16) {
          const val = frequencyData[i] || 0;
          barH = Math.max(4, (val / 255) * (h * 0.85));
        } else {
          const amplitude =
            Math.sin(i * 0.35 + t * 0.009) *
            Math.cos(i * 0.2 + t * 0.006) *
            (h * 0.4);
          barH = Math.abs(amplitude) + 6;
        }

        const x = i * (barW + 3) + 4;
        const y = (h - barH) / 2;

        const intensity = Math.min(1, barH / (h * 0.85));
        const r = Math.floor(210 + intensity * 45);
        const g = Math.floor(130 + intensity * 60);
        const b = Math.floor(40 + intensity * 40);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
    },
    [isPlaying, frequencyData]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      drawWaveform(ctx, canvas.clientWidth, canvas.clientHeight, t);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWaveform]);

  return (
    <div className="relative z-20 mx-3 mb-2">
      {/* Waveform + controls */}
      <div className="bg-black/75 backdrop-blur-md rounded-2xl p-3 border border-amber-800/40 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 flex items-center justify-center hover:from-amber-600 hover:to-amber-400 transition-all shadow-md active:scale-95"
            aria-label={isPlaying ? "Stop speaking" : "Play soil voice"}
          >
            {isPlaying ? (
              <VolumeX className="w-5 h-5 text-white animate-pulse" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
          <canvas ref={canvasRef} className="flex-1 h-12" />
        </div>

        {/* Subtitles */}
        {showSubtitles && subtitles && (
          <div className="mt-2 px-1">
            <p className="text-xs text-amber-100/90 italic leading-relaxed bg-black/40 p-2 rounded-lg border border-white/5">
              &ldquo;{subtitles}&rdquo;
            </p>
          </div>
        )}

        <button
          onClick={() => setShowSubtitles(!showSubtitles)}
          className="mt-1 text-[11px] text-amber-400/70 hover:text-amber-300 transition-colors"
        >
          {showSubtitles ? "Hide subtitles" : "Show subtitles"}
        </button>
      </div>
    </div>
  );
}

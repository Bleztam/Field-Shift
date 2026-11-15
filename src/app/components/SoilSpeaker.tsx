"use client";

import React, { useRef, useEffect, useCallback } from "react";
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
  const subtitleRef = useRef<HTMLDivElement>(null);

  // ── Compact waveform visualization ──
  const drawWaveform = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      ctx.clearRect(0, 0, w, h);

      const barsCount = 12;
      const gap = 2;
      const barW = Math.max(2, (w - barsCount * gap) / barsCount);

      for (let i = 0; i < barsCount; i++) {
        let barH = 3;
        if (isPlaying && frequencyData && frequencyData.length >= 12) {
          // map 16 bars → 12 bars
          const srcIdx = Math.floor((i / barsCount) * frequencyData.length);
          const val = frequencyData[srcIdx] || 0;
          barH = Math.max(3, (val / 255) * (h * 0.85));
        } else if (isPlaying) {
          // simulated sine fallback
          barH = Math.abs(Math.sin(i * 0.4 + t * 0.01) * h * 0.45) + 3;
        } else {
          // idle breathing
          barH = 2 + Math.abs(Math.sin(i * 0.3 + t * 0.0015)) * 3;
        }

        const x = i * (barW + gap) + 2;
        const y = (h - barH) / 2;
        const intensity = Math.min(1, barH / (h * 0.85));
        const r = Math.floor(210 + intensity * 45);
        const g = Math.floor(130 + intensity * 50);
        const b = Math.floor(40);
        ctx.fillStyle = `rgba(${r},${g},${b},${isPlaying ? 0.95 : 0.4})`;
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D).roundRect(x, y, barW, barH, 1);
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWaveform(ctx, canvas.clientWidth, canvas.clientHeight, t);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWaveform]);

  // ── Auto-scroll subtitle text ──
  useEffect(() => {
    const el = subtitleRef.current;
    if (!el || !isPlaying || !subtitles) return;

    el.scrollTop = 0;
    let pos = 0;
    const speed = 0.4; // px per frame

    const scroll = () => {
      if (!el) return;
      pos += speed;
      if (pos > el.scrollHeight - el.clientHeight) pos = 0;
      el.scrollTop = pos;
      raf = requestAnimationFrame(scroll);
    };

    let raf = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, subtitles]);

  return (
    // Compact floating glassmorphic game speech bubble — max 2 lines tall
    <div className="relative z-20 mx-3 mb-2">
      <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-amber-500/30 shadow-lg shadow-black/40 px-2 py-1.5 flex items-center gap-2">
        {/* 🔊 Toggle button */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 flex items-center justify-center hover:from-amber-600 hover:to-amber-400 transition-all shadow active:scale-95"
          aria-label={isPlaying ? "Stop speaking" : "Play soil voice"}
        >
          {isPlaying ? (
            <VolumeX className="w-4 h-4 text-white animate-pulse" />
          ) : (
            <Volume2 className="w-4 h-4 text-white" />
          )}
        </button>

        {/* Compact waveform (32px tall) */}
        <canvas ref={canvasRef} className="flex-shrink-0 h-8 w-16" />

        {/* 2-line auto-scrolling subtitle */}
        {subtitles ? (
          <div
            ref={subtitleRef}
            className="flex-1 overflow-hidden"
            style={{ maxHeight: "2.6rem" }}
          >
            <p className="text-[11px] text-amber-100/90 italic leading-tight whitespace-normal">
              &ldquo;{subtitles}&rdquo;
            </p>
          </div>
        ) : (
          <p className="flex-1 text-[11px] text-amber-500/50 italic">
            {isPlaying ? "Listening to soil…" : "Tap 🔊 to hear the soil speak"}
          </p>
        )}
      </div>
    </div>
  );
}

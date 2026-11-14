"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface SoilSpeakerProps {
  script: string;
  subtitles: string;
  language: string;
  isPlaying: boolean;
  onToggle: () => void;
}

export default function SoilSpeaker({
  script,
  subtitles,
  language,
  isPlaying,
  onToggle,
}: SoilSpeakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // ── Browser TTS ──
  useEffect(() => {
    if (!isPlaying || !script) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(script);

    // Try to match language
    const langMap: Record<string, string> = {
      English: "en-US",
      Amharic: "am-ET",
      "Afaan Oromo": "om-ET",
      Spanish: "es-ES",
    };
    utterance.lang = langMap[language] || "en-US";
    utterance.rate = 0.85;
    utterance.pitch = 0.7; // Deep, earthy voice

    utterance.onend = onToggle;

    synth.speak(utterance);
    return () => synth.cancel();
  }, [isPlaying, script, language, onToggle]);

  // ── Audio waveform visualization ──
  const drawWaveform = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      ctx.clearRect(0, 0, w, h);

      if (!isPlaying) {
        // Idle state — flat line with subtle pulse
        ctx.strokeStyle = "rgba(139, 92, 42, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const midY = h / 2;
        for (let x = 0; x < w; x++) {
          const y = midY + Math.sin(x * 0.05 + t * 0.002) * 2;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      // Active speaking — dramatic waveform
      const bars = 48;
      const barW = (w - bars * 2) / bars;

      for (let i = 0; i < bars; i++) {
        const amplitude =
          Math.sin(i * 0.3 + t * 0.008) *
          Math.cos(i * 0.15 + t * 0.005) *
          (h * 0.35);
        const barH = Math.abs(amplitude) + 4;
        const x = i * (barW + 2) + 4;
        const y = (h - barH) / 2;

        const intensity = barH / (h * 0.35);
        const r = Math.floor(139 + intensity * 80);
        const g = Math.floor(69 + intensity * 60);
        const b = Math.floor(19 + intensity * 30);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
    },
    [isPlaying]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (t: number) => {
      canvas.width = canvas.clientWidth * 2;
      canvas.height = canvas.clientHeight * 2;
      ctx.scale(2, 2);
      drawWaveform(ctx, canvas.clientWidth, canvas.clientHeight, t);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWaveform]);

  return (
    <div className="relative z-20 mx-4 mb-2">
      {/* Waveform + controls */}
      <div className="bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-amber-800/30">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-700/80 flex items-center justify-center hover:bg-amber-600 transition-colors"
            aria-label={isPlaying ? "Stop speaking" : "Play soil voice"}
          >
            {isPlaying ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
          <canvas ref={canvasRef} className="flex-1 h-12" />
        </div>

        {/* Subtitles */}
        {showSubtitles && subtitles && (
          <div className="mt-2 px-2">
            <p className="text-sm text-amber-100/90 italic leading-relaxed">
              &ldquo;{subtitles}&rdquo;
            </p>
          </div>
        )}

        <button
          onClick={() => setShowSubtitles(!showSubtitles)}
          className="mt-1 text-xs text-amber-400/60 hover:text-amber-300 transition-colors"
        >
          {showSubtitles ? "Hide subtitles" : "Show subtitles"}
        </button>
      </div>
    </div>
  );
}

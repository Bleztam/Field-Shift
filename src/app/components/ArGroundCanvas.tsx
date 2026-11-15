"use client";

import React, { useRef, useEffect } from "react";

export interface NasaMetricsSummary {
  smapMoisture?: number;
  ecostressEsi?: number;
  landsatNdvi?: number;
  landsatBsi?: number;
  srtmSlope?: number;
  temp?: number;
  precip?: number;
  solar?: number;
}

export interface GroundTruthSummary {
  residueCoverPct?: number;
  surfaceCrackSeverity?: string;
  uncertaintyReduction?: {
    satelliteOnlyPct: number;
    fusedPct: number;
  };
}

export interface ArGroundCanvasProps {
  activeStrategyIndex: number;
  frequencyData: number[]; // 16 bars (0-255)
  isSpeaking: boolean;
  nasaMetrics: NasaMetricsSummary | null;
  groundTruth: GroundTruthSummary | null;
}

/**
 * ArGroundCanvas: Isolated ground-plane visualization layer.
 * Responds to real-time audio frequencyData, soil voice state,
 * active crop strategy, and fused orbital/ground metrics.
 */
export default function ArGroundCanvas({
  activeStrategyIndex,
  frequencyData,
  isSpeaking,
  nasaMetrics,
  groundTruth,
}: ArGroundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.02;
      const w = (canvas.width = canvas.clientWidth);
      const h = (canvas.height = canvas.clientHeight);

      ctx.clearRect(0, 0, w, h);

      // Average audio energy from 16 frequency bands
      const avgEnergy =
        frequencyData && frequencyData.length > 0
          ? frequencyData.reduce((acc, v) => acc + v, 0) / (frequencyData.length * 255)
          : 0;

      // ── Acoustic Ground Ripple Pulse when Soil Speaks ──
      if (isSpeaking && avgEnergy > 0.05) {
        const cx = w * 0.5;
        const cy = h * 0.65;
        const maxRadius = Math.min(w, h) * 0.55;

        for (let r = 1; r <= 4; r++) {
          const ringProgress = (time * 1.5 + r * 0.25) % 1;
          const radius = ringProgress * maxRadius * (0.8 + avgEnergy * 0.4);
          const alpha = (1 - ringProgress) * (0.25 + avgEnergy * 0.5);

          ctx.beginPath();
          ctx.ellipse(cx, cy, radius, radius * 0.4, 0, 0, Math.PI * 2);

          // Hue shifts according to strategy: Baseline (amber), Bridge (emerald), Hydro-Shield (cyan)
          const ringHue = activeStrategyIndex === 1 ? 145 : activeStrategyIndex === 2 ? 190 : 38;
          ctx.strokeStyle = `hsla(${ringHue}, 90%, 55%, ${alpha})`;
          ctx.lineWidth = 2 + avgEnergy * 3;
          ctx.stroke();
        }
      }

      // ── Sub-surface Frequency Waveform Indicator ──
      if (isSpeaking && frequencyData && frequencyData.length === 16) {
        const barW = Math.max(3, (w * 0.6) / 16);
        const startX = (w - 16 * barW) * 0.5;
        const baselineY = h * 0.72;

        for (let i = 0; i < 16; i++) {
          const val = frequencyData[i] || 0;
          const barH = (val / 255) * 45;
          const x = startX + i * barW;
          const y = baselineY - barH * 0.5;

          const barHue = 35 + i * 4;
          ctx.fillStyle = `hsla(${barHue}, 95%, 60%, 0.75)`;
          ctx.fillRect(x, y, barW - 1.5, Math.max(2, barH));
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [activeStrategyIndex, frequencyData, isSpeaking, nasaMetrics, groundTruth]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-15 w-full h-full"
    />
  );
}

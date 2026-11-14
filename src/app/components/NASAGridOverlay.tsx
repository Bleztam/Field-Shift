"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { SatellitePreset } from "@/lib/types";

interface NASAGridOverlayProps {
  preset: SatellitePreset | null;
}

export default function NASAGridOverlay({ preset }: NASAGridOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const esiColors = useMemo(() => {
    if (!preset) return [];
    return preset.ecostress_esi.map((v) => {
      const r = Math.floor((1 - v) * 255);
      const g = Math.floor(v * 200);
      return `rgba(${r}, ${g}, 60, 0.35)`;
    });
  }, [preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preset) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (t: number) => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // ── 3D perspective grid ──
      const gridRows = 8;
      const gridCols = 10;
      const horizon = h * 0.35;
      const vanishX = w * 0.5;

      ctx.strokeStyle = "rgba(0, 255, 200, 0.3)";
      ctx.lineWidth = 1;

      for (let row = 0; row <= gridRows; row++) {
        const progress = row / gridRows;
        const y = horizon + (h - horizon) * progress;
        const spread = 0.3 + progress * 0.7;
        const x1 = vanishX - (w * 0.5 * spread);
        const x2 = vanishX + (w * 0.5 * spread);

        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();

        // ECOSTRESS heat zones
        const monthIdx = Math.floor((t * 0.0005 + row) % 12);
        const cellW = (x2 - x1) / gridCols;
        for (let col = 0; col < gridCols; col++) {
          const esiIdx = (monthIdx + col) % esiColors.length;
          ctx.fillStyle = esiColors[esiIdx] || "rgba(100,100,100,0.1)";
          ctx.fillRect(x1 + col * cellW, y, cellW, (h - horizon) / gridRows);
        }
      }

      // Vertical perspective lines
      for (let col = 0; col <= gridCols; col++) {
        const fraction = col / gridCols;
        ctx.beginPath();
        ctx.moveTo(vanishX, horizon);
        ctx.lineTo(w * fraction, h);
        ctx.strokeStyle = "rgba(0, 255, 200, 0.15)";
        ctx.stroke();
      }

      // ── SRTM runoff arrows ──
      const aspect = preset.srtm_aspect_deg;
      const rad = (aspect * Math.PI) / 180;
      const slope = preset.srtm_slope_deg;
      const arrowLen = 20 + slope * 5;

      ctx.strokeStyle = "rgba(50, 150, 255, 0.7)";
      ctx.fillStyle = "rgba(50, 150, 255, 0.7)";
      ctx.lineWidth = 2;

      for (let ax = 0; ax < 5; ax++) {
        for (let ay = 0; ay < 3; ay++) {
          const cx = w * 0.2 + ax * w * 0.15;
          const cy = h * 0.55 + ay * h * 0.12;
          const wobble = Math.sin(t * 0.003 + ax + ay) * 5;

          const ex = cx + Math.sin(rad) * (arrowLen + wobble);
          const ey = cy + Math.cos(rad) * (arrowLen + wobble) * 0.5;

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ex, ey);
          ctx.stroke();

          // Arrowhead
          const headLen = 8;
          const headAngle = Math.atan2(ey - cy, ex - cx);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(
            ex - headLen * Math.cos(headAngle - 0.4),
            ey - headLen * Math.sin(headAngle - 0.4)
          );
          ctx.lineTo(
            ex - headLen * Math.cos(headAngle + 0.4),
            ey - headLen * Math.sin(headAngle + 0.4)
          );
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── Labels ──
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "rgba(0, 255, 200, 0.8)";
      ctx.fillText(
        `SRTM Slope: ${slope.toFixed(1)}° | Aspect: ${aspect}°`,
        12,
        horizon - 10
      );
      ctx.fillText("ECOSTRESS Heat Zones ▼", 12, horizon + 14);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [preset, esiColors]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none w-full h-full"
    />
  );
}

"use client";

import React, { useRef, useEffect } from "react";
import { SoilMood } from "@/lib/types";

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
  mood?: SoilMood;
}

/**
 * ArGroundCanvas:
 * Renders the living AR Ground Face and real-time acoustic resonance terrain ripples.
 * Expresses mood ("stressed" | "hopeful" | "thriving") and animates speech with frequencyData.
 */
export default function ArGroundCanvas({
  activeStrategyIndex,
  frequencyData,
  isSpeaking,
  nasaMetrics,
  groundTruth,
  mood = "stressed",
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
      time += 0.025;
      const dpr = window.devicePixelRatio || 1;
      const w = (canvas.width = canvas.clientWidth * dpr);
      const h = (canvas.height = canvas.clientHeight * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.clearRect(0, 0, w, h);

      // Average voice energy
      const avgEnergy =
        frequencyData && frequencyData.length > 0
          ? frequencyData.reduce((acc, v) => acc + v, 0) / (frequencyData.length * 255)
          : 0;

      // Center perspective ground coordinates
      const cx = w * 0.5;
      const cy = h * 0.52; // mid ground
      const faceRadiusX = w * 0.24;
      const faceRadiusY = w * 0.15; // perspective tilt

      // Mood color palettes
      let mainHue = 28; // stressed: amber/rust
      let glowColor = "rgba(230, 110, 40, 0.6)";
      let moodText = "😟 Stressed: Low Moisture (42mm)";
      let moodBg = "rgba(180, 50, 15, 0.75)";

      if (mood === "hopeful") {
        mainHue = 48; // hopeful: warm gold/amber
        glowColor = "rgba(240, 190, 50, 0.7)";
        moodText = "😌 Hopeful: Bridge Cover Seeded";
        moodBg = "rgba(160, 120, 10, 0.75)";
      } else if (mood === "thriving") {
        mainHue = 145; // thriving: lush emerald
        glowColor = "rgba(40, 220, 120, 0.75)";
        moodText = "🌿 Thriving: Bio-Shield Infiltration";
        moodBg = "rgba(10, 140, 60, 0.75)";
      }

      // ── 1. Acoustic Resonance Ground Waves ──
      if (isSpeaking && avgEnergy > 0.03) {
        for (let r = 1; r <= 3; r++) {
          const waveProg = (time * 1.2 + r * 0.33) % 1;
          const rx = (faceRadiusX + waveProg * w * 0.35) * (1 + avgEnergy * 0.2);
          const ry = (faceRadiusY + waveProg * h * 0.18) * (1 + avgEnergy * 0.2);
          const alpha = (1 - waveProg) * (0.35 + avgEnergy * 0.5);

          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${mainHue}, 90%, 55%, ${alpha})`;
          ctx.lineWidth = (2 + avgEnergy * 3) * dpr;
          ctx.stroke();
        }
      }

      // ── 2. AR Soil Face Contour & Root Tendrils ──
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12 * dpr;

      // Face boundary contour
      ctx.beginPath();
      ctx.ellipse(cx, cy, faceRadiusX, faceRadiusY, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${mainHue}, 85%, 60%, 0.65)`;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // Root tendrils growing outward
      const numTendrils = 8;
      for (let i = 0; i < numTendrils; i++) {
        const angle = (i / numTendrils) * Math.PI * 2 + time * 0.05;
        const startX = cx + Math.cos(angle) * faceRadiusX;
        const startY = cy + Math.sin(angle) * faceRadiusY;
        const wave = Math.sin(time * 2 + i) * 6 * dpr;
        const endX = startX + Math.cos(angle) * (20 * dpr) + wave;
        const endY = startY + Math.sin(angle) * (12 * dpr);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(startX + wave, startY + wave, endX, endY);
        ctx.strokeStyle = `hsla(${mainHue + (mood === "thriving" ? 15 : -10)}, 75%, 50%, 0.45)`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      // ── 3. Expressive Glowing Eyes ──
      const eyeOffsetX = faceRadiusX * 0.42;
      const eyeOffsetY = -faceRadiusY * 0.18;
      const eyeR = 6 * dpr;

      // Left & Right eye positions
      const eyes = [
        { x: cx - eyeOffsetX, y: cy + eyeOffsetY },
        { x: cx + eyeOffsetX, y: cy + eyeOffsetY },
      ];

      eyes.forEach((eye, idx) => {
        const browOffset = idx === 0 ? 1 : -1;

        if (mood === "stressed") {
          // Furrowed, tilted brows
          ctx.beginPath();
          ctx.moveTo(eye.x - 9 * dpr * browOffset, eye.y - 7 * dpr);
          ctx.lineTo(eye.x + 9 * dpr * browOffset, eye.y - 3 * dpr);
          ctx.strokeStyle = `hsla(${mainHue}, 90%, 65%, 0.8)`;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();

          // Squinting eye
          ctx.beginPath();
          ctx.ellipse(eye.x, eye.y, eyeR, eyeR * 0.45, 0, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${mainHue}, 95%, 75%, 0.9)`;
          ctx.fill();
        } else if (mood === "hopeful") {
          // Gentle arched brow
          ctx.beginPath();
          ctx.arc(eye.x, eye.y - 5 * dpr, 8 * dpr, Math.PI * 1.1, Math.PI * 1.9);
          ctx.strokeStyle = `hsla(${mainHue}, 90%, 75%, 0.8)`;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();

          // Round warm eye
          ctx.beginPath();
          ctx.arc(eye.x, eye.y, eyeR * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${mainHue}, 95%, 70%, 0.95)`;
          ctx.fill();
        } else {
          // Thriving: wide radiant curved happy eyes
          ctx.beginPath();
          ctx.arc(eye.x, eye.y - 2 * dpr, eyeR * 1.1, Math.PI * 1.15, Math.PI * 1.85);
          ctx.strokeStyle = `hsla(${mainHue}, 95%, 75%, 0.95)`;
          ctx.lineWidth = 2.5 * dpr;
          ctx.stroke();

          // Small green leaf sparkle above each eye
          ctx.beginPath();
          ctx.ellipse(eye.x, eye.y - 9 * dpr, 4 * dpr, 2 * dpr, 0.4 * browOffset, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(100, 255, 160, 0.9)";
          ctx.fill();
        }
      });

      // ── 4. Expressive Speaking Mouth ──
      const mouthY = cy + faceRadiusY * 0.35;
      const mouthWidth = faceRadiusX * 0.45;

      if (isSpeaking) {
        // Mouth opens and pulses with frequency data
        const mouthOpenH = Math.max(4 * dpr, avgEnergy * 24 * dpr);
        ctx.beginPath();
        ctx.ellipse(cx, mouthY, mouthWidth * 0.55, mouthOpenH, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${mainHue}, 85%, 25%, 0.9)`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${mainHue}, 95%, 75%, 0.95)`;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      } else {
        // Resting mouth line
        ctx.beginPath();
        if (mood === "stressed") {
          // Downward turned cracked mouth
          ctx.moveTo(cx - mouthWidth * 0.4, mouthY + 2 * dpr);
          ctx.lineTo(cx, mouthY - 2 * dpr);
          ctx.lineTo(cx + mouthWidth * 0.4, mouthY + 2 * dpr);
        } else if (mood === "hopeful") {
          // Gentle peaceful line
          ctx.moveTo(cx - mouthWidth * 0.35, mouthY);
          ctx.lineTo(cx + mouthWidth * 0.35, mouthY);
        } else {
          // Vibrant upward smile arc
          ctx.arc(cx, mouthY - 6 * dpr, mouthWidth * 0.45, 0.25 * Math.PI, 0.75 * Math.PI);
        }
        ctx.strokeStyle = `hsla(${mainHue}, 90%, 70%, 0.85)`;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }

      ctx.restore();

      // ── 5. Ground AR Mood Pill Tag ──
      const tagText = moodText;
      ctx.font = `bold ${10 * dpr}px sans-serif`;
      const textWidth = ctx.measureText(tagText).width;
      const tagW = textWidth + 18 * dpr;
      const tagH = 18 * dpr;
      const tagX = cx - tagW * 0.5;
      const tagY = cy - faceRadiusY - 18 * dpr;

      ctx.save();
      ctx.fillStyle = moodBg;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 9 * dpr);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tagText, cx, tagY + tagH * 0.5);
      ctx.restore();

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [activeStrategyIndex, frequencyData, isSpeaking, nasaMetrics, groundTruth, mood]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-15 w-full h-full"
    />
  );
}

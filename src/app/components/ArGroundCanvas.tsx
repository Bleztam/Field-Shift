"use client";

import React, { useRef, useEffect, useCallback } from "react";
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

// ── Particle types ──
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0-1
  maxLife: number;
  size: number;
  angle?: number;
}

export default function ArGroundCanvas({
  activeStrategyIndex,
  frequencyData,
  isSpeaking,
  mood = "stressed",
}: ArGroundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // ── Persistent state via refs ──
  const timeRef = useRef(0);
  const mousePosRef = useRef({ x: 0.5, y: 0.5 }); // normalized 0-1
  const pupilPosRef = useRef({ x: 0, y: 0 }); // smoothed, in canvas coords
  const blinkRef = useRef<"open" | "closing" | "closed" | "opening">("open");
  const blinkProgressRef = useRef(0); // 0=open 1=fully closed
  const nextBlinkRef = useRef(4); // seconds until next blink
  const particlesRef = useRef<Particle[]>([]);

  // ── Mouse / Touch tracking ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      mousePosRef.current = {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    };

    canvas.addEventListener("mousemove", onMove, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: true });
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onMove);
    };
  }, []);

  // ── Particle spawner ──
  const spawnParticle = useCallback(
    (cx: number, cy: number, faceR: number) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = faceR * (0.6 + Math.random() * 0.5);

      if (mood === "stressed") {
        // Embers – rising orange sparks
        particlesRef.current.push({
          x: cx + Math.cos(angle) * dist * 0.5,
          y: cy + Math.sin(angle) * dist * 0.4 + faceR * 0.3,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(0.6 + Math.random() * 1.2),
          life: 1,
          maxLife: 60 + Math.random() * 40,
          size: 2 + Math.random() * 3,
        });
      } else if (mood === "hopeful") {
        // Nitrogen leaves – rising green
        particlesRef.current.push({
          x: cx + (Math.random() - 0.5) * faceR * 1.6,
          y: cy + faceR * 0.4,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -(0.3 + Math.random() * 0.6),
          life: 1,
          maxLife: 90 + Math.random() * 60,
          size: 4 + Math.random() * 4,
          angle: Math.random() * Math.PI * 2,
        });
      } else {
        // Hydro-Shield – water droplets
        particlesRef.current.push({
          x: cx + (Math.random() - 0.5) * faceR * 1.8,
          y: cy - faceR * 0.2 - Math.random() * faceR * 0.5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0.3 + Math.random() * 0.5,
          life: 1,
          maxLife: 70 + Math.random() * 50,
          size: 3 + Math.random() * 4,
        });
      }

      // Cap at 25
      if (particlesRef.current.length > 25) {
        particlesRef.current.splice(0, particlesRef.current.length - 25);
      }
    },
    [mood]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTimestamp = 0;

    const render = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimestamp) / 16.67, 3); // delta frames, capped
      lastTimestamp = timestamp;
      timeRef.current += 0.025 * dt;
      const t = timeRef.current;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, cssW, cssH);

      // ── Layout constants ──
      const cx = cssW * 0.5;
      const cy = cssH * 0.52;
      const faceR = Math.min(cssW, cssH) * 0.28; // face radius

      // ── Voice energy ──
      const avgEnergy =
        frequencyData && frequencyData.length > 0
          ? frequencyData.reduce((s, v) => s + v, 0) /
            (frequencyData.length * 255)
          : 0;

      // ── Mood colors ──
      const moodConfig = {
        stressed: {
          base: "#5a2e0a",
          mid: "#7a3f10",
          hi: "#c46a1f",
          glow: "rgba(220,80,20,0.5)",
          iris: ["#b85200", "#7a2f00", "#3a1200"],
          moodLabel: "😟 Stressed",
        },
        hopeful: {
          base: "#3a2800",
          mid: "#6e4a08",
          hi: "#c09020",
          glow: "rgba(220,170,30,0.55)",
          iris: ["#c8a020", "#8a6010", "#3a2800"],
          moodLabel: "😌 Hopeful",
        },
        thriving: {
          base: "#0a2a10",
          mid: "#1a5a1e",
          hi: "#30a040",
          glow: "rgba(40,180,80,0.55)",
          iris: ["#28c850", "#128030", "#052010"],
          moodLabel: "🌿 Thriving",
        },
      };
      const mc = moodConfig[mood];

      // ── Blink animation ──
      nextBlinkRef.current -= 0.025 * dt;
      if (nextBlinkRef.current <= 0 && blinkRef.current === "open") {
        blinkRef.current = "closing";
        nextBlinkRef.current = 3 + Math.random() * 4;
      }
      if (blinkRef.current === "closing") {
        blinkProgressRef.current = Math.min(
          1,
          blinkProgressRef.current + 0.12 * dt
        );
        if (blinkProgressRef.current >= 1) blinkRef.current = "closed";
      } else if (blinkRef.current === "closed") {
        blinkProgressRef.current = Math.max(
          0,
          blinkProgressRef.current - 0.08 * dt
        );
        if (blinkProgressRef.current <= 0) blinkRef.current = "open";
      } else {
        blinkProgressRef.current = 0;
      }
      const blinkP = blinkProgressRef.current;

      // ── Smooth pupil tracking ──
      const targetPX = cx + (mousePosRef.current.x - 0.5) * faceR * 0.18;
      const targetPY = cy + (mousePosRef.current.y - 0.5) * faceR * 0.12;
      pupilPosRef.current.x +=
        (targetPX - pupilPosRef.current.x) * 0.07 * dt;
      pupilPosRef.current.y +=
        (targetPY - pupilPosRef.current.y) * 0.07 * dt;

      // ── Spawn particles ──
      if (Math.random() < 0.25 * dt) spawnParticle(cx, cy, faceR);

      // ════════════════════════════════════════════
      // 1. GROUND INTEGRATION DISC
      // ════════════════════════════════════════════
      const grd = ctx.createRadialGradient(cx, cy + faceR * 0.3, 0, cx, cy, faceR * 2.2);
      grd.addColorStop(0, "rgba(60,35,10,0.55)");
      grd.addColorStop(0.5, "rgba(40,20,5,0.3)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.ellipse(cx, cy + faceR * 0.3, faceR * 2.0, faceR * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // ════════════════════════════════════════════
      // 2. OUTER SHADOW / DEPTH RING
      // ════════════════════════════════════════════
      const outerGrd = ctx.createRadialGradient(
        cx - faceR * 0.15, cy - faceR * 0.1, faceR * 0.3,
        cx, cy, faceR * 1.05
      );
      outerGrd.addColorStop(0, "rgba(30,15,5,0)");
      outerGrd.addColorStop(0.75, "rgba(30,15,5,0.4)");
      outerGrd.addColorStop(1, "rgba(10,5,0,0.9)");
      ctx.beginPath();
      ctx.ellipse(cx, cy, faceR * 1.02, faceR, 0, 0, Math.PI * 2);
      ctx.fillStyle = outerGrd;
      ctx.fill();

      // ════════════════════════════════════════════
      // 3. SCULPTED FACE BASE (3D-shaded clay/stone)
      // ════════════════════════════════════════════
      // Base layer
      const faceGrd = ctx.createRadialGradient(
        cx - faceR * 0.2, cy - faceR * 0.25, faceR * 0.05,
        cx + faceR * 0.05, cy + faceR * 0.05, faceR * 1.0
      );
      faceGrd.addColorStop(0, mc.hi);
      faceGrd.addColorStop(0.4, mc.mid);
      faceGrd.addColorStop(0.85, mc.base);
      faceGrd.addColorStop(1, "rgba(10,5,0,0.95)");

      ctx.save();
      ctx.shadowColor = mc.glow;
      ctx.shadowBlur = 20 + avgEnergy * 25;
      ctx.beginPath();
      ctx.ellipse(cx, cy, faceR, faceR * 0.96, 0, 0, Math.PI * 2);
      ctx.fillStyle = faceGrd;
      ctx.fill();
      ctx.restore();

      // Soil texture grain overlay
      ctx.save();
      ctx.globalAlpha = 0.07;
      for (let gi = 0; gi < 60; gi++) {
        const gx = cx + (((gi * 137 + 11) % 97) / 97 - 0.5) * faceR * 1.8;
        const gy = cy + (((gi * 61 + 7) % 83) / 83 - 0.5) * faceR * 1.8;
        const dist = Math.hypot(gx - cx, gy - cy);
        if (dist < faceR * 0.95) {
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // ════════════════════════════════════════════
      // 4. PARTICLES (behind face glow)
      // ════════════════════════════════════════════
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt / p.maxLife;
        const alpha = Math.max(0, p.life);

        ctx.save();
        if (mood === "stressed") {
          // Ember
          ctx.shadowColor = "rgba(255,120,20,0.8)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = `rgba(255,${80 + Math.floor(p.life * 100)},20,${alpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        } else if (mood === "hopeful") {
          // Leaf
          ctx.translate(p.x, p.y);
          ctx.rotate((p.angle ?? 0) + t * 0.5);
          ctx.fillStyle = `rgba(50,200,80,${alpha * 0.85})`;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.bezierCurveTo(p.size * 0.8, -p.size * 0.5, p.size * 0.8, p.size * 0.5, 0, p.size);
          ctx.bezierCurveTo(-p.size * 0.8, p.size * 0.5, -p.size * 0.8, -p.size * 0.5, 0, -p.size);
          ctx.fill();
        } else {
          // Water droplet
          ctx.translate(p.x, p.y);
          ctx.fillStyle = `rgba(100,200,255,${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // Teardrop tail
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.4, 0);
          ctx.bezierCurveTo(-p.size * 0.4, -p.size, 0, -p.size * 1.6, 0, -p.size * 1.6);
          ctx.bezierCurveTo(0, -p.size * 1.6, p.size * 0.4, -p.size, p.size * 0.4, 0);
          ctx.fillStyle = `rgba(80,180,255,${alpha * 0.5})`;
          ctx.fill();
        }
        ctx.restore();
      }

      // ════════════════════════════════════════════
      // 5. EYEBROWS (thick earthen, mood-driven)
      // ════════════════════════════════════════════
      const eyeOffX = faceR * 0.32;
      const eyeOffY = -faceR * 0.17;
      const eyeRx = faceR * 0.17;
      const eyeRy = faceR * 0.13;
      const browY = cy + eyeOffY - eyeRy - faceR * 0.06;

      ctx.save();
      ctx.lineWidth = faceR * 0.055;
      ctx.lineCap = "round";
      ctx.strokeStyle = mc.base;

      const drawBrow = (ex: number, side: 1 | -1) => {
        const bw = faceR * 0.22;
        ctx.beginPath();
        if (mood === "stressed") {
          // Furrowed — angled sharply inward
          ctx.moveTo(ex - bw * side, browY - faceR * 0.04);
          ctx.quadraticCurveTo(ex, browY + faceR * 0.03, ex + bw * side, browY - faceR * 0.01);
        } else if (mood === "hopeful") {
          // Gently arched upward
          ctx.moveTo(ex - bw * side, browY);
          ctx.quadraticCurveTo(ex, browY - faceR * 0.06, ex + bw * side, browY + faceR * 0.01);
        } else {
          // Relaxed — slightly raised outer
          ctx.moveTo(ex - bw * side, browY + faceR * 0.01);
          ctx.quadraticCurveTo(ex, browY - faceR * 0.03, ex + bw * side, browY - faceR * 0.02);
        }
        ctx.stroke();
      };

      drawBrow(cx - eyeOffX, -1);
      drawBrow(cx + eyeOffX, 1);
      ctx.restore();

      // ════════════════════════════════════════════
      // 6. BIG EXPRESSIVE EYES
      // ════════════════════════════════════════════
      const eyePositions = [
        { x: cx - eyeOffX, y: cy + eyeOffY },
        { x: cx + eyeOffX, y: cy + eyeOffY },
      ];

      for (const eye of eyePositions) {
        // ── Sclera (white of eye with shadow ring)
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(eye.x, eye.y, eyeRx, eyeRy, 0, 0, Math.PI * 2);
        const scleraGrd = ctx.createRadialGradient(
          eye.x - eyeRx * 0.2, eye.y - eyeRy * 0.2, eyeRy * 0.1,
          eye.x, eye.y, eyeRx
        );
        scleraGrd.addColorStop(0, "#f0eee0");
        scleraGrd.addColorStop(0.8, "#c8c0a0");
        scleraGrd.addColorStop(1, "#806040");
        ctx.fillStyle = scleraGrd;
        ctx.fill();
        ctx.restore();

        // ── Iris
        const irisR = eyeRy * 0.68;
        const irisGrd = ctx.createRadialGradient(
          eye.x - irisR * 0.2, eye.y - irisR * 0.2, irisR * 0.1,
          eye.x, eye.y, irisR
        );
        irisGrd.addColorStop(0, mc.iris[0]);
        irisGrd.addColorStop(0.55, mc.iris[1]);
        irisGrd.addColorStop(1, mc.iris[2]);

        ctx.save();
        ctx.shadowColor = mc.glow;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisGrd;
        ctx.fill();
        ctx.restore();

        // Iris glow ring
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, irisR * 1.0, 0, Math.PI * 2);
        ctx.strokeStyle = mc.glow.replace("0.5", "0.4").replace("0.55", "0.4");
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Pupil (smoothed tracking)
        const pupilR = irisR * 0.42;
        const dxP = pupilPosRef.current.x - eye.x;
        const dyP = pupilPosRef.current.y - eye.y;
        const maxPupilTravel = irisR * 0.28;
        const pupilDist = Math.hypot(dxP, dyP);
        const pupilScale = Math.min(1, maxPupilTravel / (pupilDist + 0.01));
        const px = eye.x + dxP * pupilScale;
        const py = eye.y + dyP * pupilScale;

        const pupilGrd = ctx.createRadialGradient(px - pupilR * 0.3, py - pupilR * 0.3, pupilR * 0.05, px, py, pupilR);
        pupilGrd.addColorStop(0, "#1a0a00");
        pupilGrd.addColorStop(1, "#050200");
        ctx.beginPath();
        ctx.arc(px, py, pupilR, 0, Math.PI * 2);
        ctx.fillStyle = pupilGrd;
        ctx.fill();

        // Pupil specular highlight
        ctx.beginPath();
        ctx.arc(px - pupilR * 0.3, py - pupilR * 0.3, pupilR * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fill();

        // ── Eyelids (blinking via bezier arc)
        if (blinkP > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(eye.x, eye.y, eyeRx * 1.02, eyeRy * 1.02, 0, 0, Math.PI * 2);
          ctx.clip();

          // Upper lid sweeps down
          const lidH = eyeRy * 2 * blinkP;
          const faceBaseColor = mc.mid;
          ctx.fillStyle = faceBaseColor;
          ctx.fillRect(eye.x - eyeRx - 2, eye.y - eyeRy - 2, eyeRx * 2 + 4, lidH + 2);
          ctx.restore();
        }

        // Eyelash top line
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(eye.x, eye.y, eyeRx * 1.02, eyeRy * 1.02, 0, Math.PI, Math.PI * 2);
        ctx.strokeStyle = "rgba(20,10,5,0.9)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      // ════════════════════════════════════════════
      // 7. LIP-SYNCING CAVERNOUS MOUTH
      // ════════════════════════════════════════════
      const mouthCY = cy + faceR * 0.42;
      const mouthW = faceR * 0.5;

      if (isSpeaking) {
        // Vowel shaping from energy
        const openH =
          avgEnergy > 0.7
            ? faceR * 0.28 // "Ah" wide
            : avgEnergy > 0.4
            ? faceR * 0.19 // "O" shape
            : faceR * 0.08 + Math.sin(t * 8) * faceR * 0.03; // subtle breath

        // Inner glow (glowing earth/roots)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(mouthCY > 0 ? cx : cx, mouthCY, mouthW * 0.52, openH, 0, 0, Math.PI * 2);
        const innerGrd = ctx.createRadialGradient(cx, mouthCY + openH * 0.2, 0, cx, mouthCY, mouthW * 0.52);
        innerGrd.addColorStop(0, "rgba(255,160,30,0.95)");
        innerGrd.addColorStop(0.4, "rgba(180,60,10,0.9)");
        innerGrd.addColorStop(1, "rgba(30,10,0,0.95)");
        ctx.fillStyle = innerGrd;
        ctx.shadowColor = "rgba(255,120,20,0.8)";
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.restore();

        // Mouth outer lips (bezier curves)
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = mc.hi;
        ctx.shadowColor = mc.glow;
        ctx.shadowBlur = 10;
        // Upper lip
        ctx.beginPath();
        ctx.moveTo(cx - mouthW * 0.52, mouthCY);
        ctx.bezierCurveTo(
          cx - mouthW * 0.25, mouthCY - openH * 0.6,
          cx + mouthW * 0.25, mouthCY - openH * 0.6,
          cx + mouthW * 0.52, mouthCY
        );
        ctx.stroke();
        // Lower lip
        ctx.beginPath();
        ctx.moveTo(cx - mouthW * 0.52, mouthCY);
        ctx.bezierCurveTo(
          cx - mouthW * 0.3, mouthCY + openH * 1.1,
          cx + mouthW * 0.3, mouthCY + openH * 1.1,
          cx + mouthW * 0.52, mouthCY
        );
        ctx.stroke();
        ctx.restore();
      } else {
        // Idle mouth — mood-driven bezier
        ctx.save();
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = mc.hi;
        const breathe = Math.sin(t * 1.1) * faceR * 0.012;

        ctx.beginPath();
        if (mood === "stressed") {
          // Downturned cracked frown
          ctx.moveTo(cx - mouthW * 0.42, mouthCY - breathe);
          ctx.bezierCurveTo(
            cx - mouthW * 0.15, mouthCY + faceR * 0.06 + breathe,
            cx + mouthW * 0.15, mouthCY + faceR * 0.06 + breathe,
            cx + mouthW * 0.42, mouthCY - breathe
          );
        } else if (mood === "hopeful") {
          // Gentle neutral-to-slight smile
          ctx.moveTo(cx - mouthW * 0.4, mouthCY);
          ctx.bezierCurveTo(
            cx - mouthW * 0.1, mouthCY - faceR * 0.03 + breathe,
            cx + mouthW * 0.1, mouthCY - faceR * 0.03 + breathe,
            cx + mouthW * 0.4, mouthCY
          );
        } else {
          // Warm broad smile
          ctx.moveTo(cx - mouthW * 0.44, mouthCY);
          ctx.bezierCurveTo(
            cx - mouthW * 0.1, mouthCY - faceR * 0.11 + breathe,
            cx + mouthW * 0.1, mouthCY - faceR * 0.11 + breathe,
            cx + mouthW * 0.44, mouthCY
          );
        }
        ctx.stroke();
        ctx.restore();
      }

      // ════════════════════════════════════════════
      // 8. CRACK FISSURES (stressed only)
      // ════════════════════════════════════════════
      if (mood === "stressed") {
        ctx.save();
        ctx.strokeStyle = "rgba(20,8,0,0.6)";
        ctx.lineWidth = 1.5;
        const cracks = [
          [0.6, 0.1, 0.9, 0.35, 1.05, 0.5],
          [-0.5, 0.3, -0.8, 0.5, -0.95, 0.7],
          [0.1, 0.65, 0.3, 0.9, 0.4, 1.1],
        ];
        for (const [x1, y1, x2, y2, x3, y3] of cracks) {
          ctx.beginPath();
          ctx.moveTo(cx + x1 * faceR, cy + y1 * faceR);
          ctx.quadraticCurveTo(
            cx + x2 * faceR,
            cy + y2 * faceR,
            cx + x3 * faceR,
            cy + y3 * faceR
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // ════════════════════════════════════════════
      // 9. ACOUSTIC RIPPLE RINGS (while speaking)
      // ════════════════════════════════════════════
      if (isSpeaking && avgEnergy > 0.04) {
        for (let r = 0; r < 3; r++) {
          const prog = ((t * 1.4 + r * 0.33) % 1);
          const rx = (faceR * 1.1 + prog * faceR * 1.8) * (1 + avgEnergy * 0.15);
          const ry = rx * 0.55;
          const alpha = (1 - prog) * (0.3 + avgEnergy * 0.5);
          ctx.beginPath();
          ctx.ellipse(cx, cy + faceR * 0.3, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = mc.glow.replace(/[\d.]+\)$/, `${alpha})`);
          ctx.lineWidth = (1.5 + avgEnergy * 2.5);
          ctx.stroke();
        }
      }

      // ════════════════════════════════════════════
      // 10. MOOD BADGE PILL
      // ════════════════════════════════════════════
      const moodText = mc.moodLabel;
      ctx.save();
      ctx.font = `bold 11px system-ui, sans-serif`;
      const tw = ctx.measureText(moodText).width;
      const pillW = tw + 20;
      const pillH = 20;
      const pillX = cx - pillW / 2;
      const pillY = cy - faceR - 24;

      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(pillX, pillY, pillW, pillH, 10);
      ctx.fill();
      ctx.strokeStyle = mc.glow;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(moodText, cx, pillY + pillH / 2);
      ctx.restore();

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [activeStrategyIndex, frequencyData, isSpeaking, mood, spawnParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto z-15 w-full h-full"
    />
  );
}

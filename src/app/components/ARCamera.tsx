"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface ARCameraProps {
  onFrame?: (canvas: HTMLCanvasElement) => void;
  simulateMode: boolean;
}

export default function ARCamera({ onFrame, simulateMode }: ARCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // ── Real camera stream ──
  useEffect(() => {
    if (simulateMode) return;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        // Camera unavailable handled by caller
      }
    })();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [simulateMode]);

  // ── Simulated dirt canvas ──
  const drawSimulatedDirt = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      // Base soil color
      ctx.fillStyle = "#5C4033";
      ctx.fillRect(0, 0, w, h);

      // Procedural dirt texture
      for (let i = 0; i < 3000; i++) {
        const x = (Math.sin(i * 1.7 + t * 0.001) * 0.5 + 0.5) * w;
        const y = (Math.cos(i * 2.3 + t * 0.0008) * 0.5 + 0.5) * h;
        const r = Math.random() * 3 + 1;
        const shade = Math.floor(60 + Math.random() * 40);
        ctx.fillStyle = `rgb(${shade + 20}, ${shade}, ${shade - 15})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cracks
      ctx.strokeStyle = "rgba(30, 20, 10, 0.4)";
      ctx.lineWidth = 2;
      for (let c = 0; c < 8; c++) {
        ctx.beginPath();
        let cx = w * (0.1 + c * 0.12);
        let cy = h * 0.2;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 6; s++) {
          cx += (Math.random() - 0.5) * 60;
          cy += 30 + Math.random() * 40;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      // Residue / straw bits
      ctx.strokeStyle = "rgba(180, 160, 80, 0.6)";
      ctx.lineWidth = 3;
      for (let s = 0; s < 15; s++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const angle = Math.random() * Math.PI;
        const len = 20 + Math.random() * 40;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
        ctx.stroke();
      }

      // Subtle animation pulse
      const pulse = Math.sin(t * 0.002) * 0.05 + 0.05;
      ctx.fillStyle = `rgba(255, 200, 100, ${pulse})`;
      ctx.fillRect(0, 0, w, h);
    },
    []
  );

  useEffect(() => {
    if (!simulateMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (t: number) => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      drawSimulatedDirt(ctx, canvas.width, canvas.height, t);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [simulateMode, drawSimulatedDirt]);

  // ── Capture frame for analysis ──
  useEffect(() => {
    if (!onFrame) return;

    const capture = () => {
      if (simulateMode) {
        if (canvasRef.current && canvasRef.current.width > 0) {
          onFrame(canvasRef.current);
        }
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 640;
        tempCanvas.height = 480;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 640, 480);
          onFrame(tempCanvas);
        }
      }
    };

    const timeout = setTimeout(capture, 1200);
    const interval = setInterval(capture, 4000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [onFrame, simulateMode]);

  return (
    <div className="absolute inset-0 z-0">
      {simulateMode ? (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />
      ) : (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}

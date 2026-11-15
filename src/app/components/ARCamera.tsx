"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export type CameraStatus = "pending" | "active" | "denied" | "unavailable";

interface ARCameraProps {
  onFrame?: (canvas: HTMLCanvasElement) => void;
  onStatus?: (status: CameraStatus) => void;
  /** Skip the camera entirely (demo/screenshot mode). */
  forceFallback?: boolean;
}

/**
 * Full-bleed rear camera backdrop. Camera is scenery only — denied or
 * unavailable falls back to a calm illustrated field. Stream stops when the
 * tab is hidden and resumes on return.
 */
export default function ARCamera({ onFrame, onStatus, forceFallback }: ARCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("pending");

  const reportStatus = useCallback(
    (s: CameraStatus) => {
      setStatus(s);
      onStatus?.(s);
    },
    [onStatus]
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    if (forceFallback) {
      reportStatus("unavailable");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      reportStatus("unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => reportStatus("unavailable");
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      reportStatus("active");
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      reportStatus(name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }, [forceFallback, reportStatus]);

  useEffect(() => {
    startStream();
    return stopStream;
  }, [startStream, stopStream]);

  // Pause the stream while the tab is hidden; resume when visible.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        stopStream();
      } else if (status === "active") {
        startStream();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status, startStream, stopStream]);

  // Capture frames for the (quiet) backend fusion payload — never advertised.
  useEffect(() => {
    if (!onFrame || status !== "active") return;
    const capture = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 640, 480);
      onFrame(c);
    };
    const timeout = setTimeout(capture, 1500);
    const interval = setInterval(capture, 5000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [onFrame, status]);

  return (
    <div className="absolute inset-0 z-0" aria-hidden="true">
      {status === "active" ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
      ) : (
        <IllustratedGround />
      )}
      {/* Soft warm scrim + edge vignette so captions stay sun-readable;
          the center stays clear so the real field shows through. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(30,20,15,0.30) 0%, rgba(30,20,15,0) 28%, rgba(30,20,15,0) 55%, rgba(30,20,15,0.42) 100%), " +
            "radial-gradient(ellipse at center, rgba(30,20,15,0) 58%, rgba(30,20,15,0.26) 100%)",
        }}
      />
    </div>
  );
}

/** Calm illustrated field shown when the camera is denied/unavailable. */
function IllustratedGround() {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 360 640"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustrated field backdrop"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9D9A8" />
          <stop offset="55%" stopColor="#D9B57A" />
          <stop offset="100%" stopColor="#C9822B" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A0522D" />
          <stop offset="100%" stopColor="#3B2A20" />
        </linearGradient>
      </defs>
      <rect width="360" height="640" fill="url(#sky)" />
      <circle cx="288" cy="96" r="38" fill="#E3C77A" opacity="0.9" />
      <circle cx="288" cy="96" r="54" fill="#E3C77A" opacity="0.25" />
      {/* distant hills */}
      <path d="M0 300 Q90 258 180 292 T360 286 V640 H0 Z" fill="#8A5A33" opacity="0.65" />
      <path d="M0 330 Q120 296 240 322 T360 316 V640 H0 Z" fill="#7A4A28" opacity="0.8" />
      {/* field */}
      <rect y="356" width="360" height="284" fill="url(#ground)" />
      {/* plough rows */}
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M${-40 + i * 12} ${392 + i * 26} Q 180 ${380 + i * 30} ${400 + i * 10} ${392 + i * 26}`}
          stroke="rgba(30,20,15,0.35)"
          strokeWidth={5 + i * 0.6}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {/* sparse stubble */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = (i * 53) % 360;
        const y = 400 + ((i * 37) % 200);
        return (
          <path
            key={`s${i}`}
            d={`M${x} ${y} l3 -14 M${x + 2} ${y} l-2 -11`}
            stroke="#E3C77A"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
        );
      })}
    </svg>
  );
}

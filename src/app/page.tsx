"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Eye,
  FlaskConical,
  Camera,
  Monitor,
  MapPin,
  Loader2,
  Mic,
  Globe,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { PRESETS } from "@/lib/presets";
import {
  AppMode,
  FarmerPriorities,
  FusedFieldData,
  Language,
  SoilVoiceResponse,
} from "@/lib/types";
import ARCamera from "./components/ARCamera";
import NASAGridOverlay from "./components/NASAGridOverlay";
import SoilSpeaker from "./components/SoilSpeaker";
import PrioritySliders from "./components/PrioritySliders";
import StrategyDrawer from "./components/StrategyDrawer";
import InspectorView from "./components/InspectorView";

const LANGUAGES: Language[] = ["English", "Amharic", "Afaan Oromo", "Spanish"];

export default function Home() {
  // ── State ──
  const [mode, setMode] = useState<AppMode>("ar");
  const [simulateCamera, setSimulateCamera] = useState(true);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [language, setLanguage] = useState<Language>("English");
  const [priorities, setPriorities] = useState<FarmerPriorities>({
    waterConservation: 70,
    soilNitrogen: 50,
    cashIncome: 60,
    livestockForage: 40,
  });

  const [fieldData, setFieldData] = useState<FusedFieldData | null>(null);
  const [soilVoice, setSoilVoice] = useState<SoilVoiceResponse | null>(null);
  const [isLoadingNasa, setIsLoadingNasa] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // ── Fetch NASA POWER + Preset Data ──
  const fetchNasaData = useCallback(async (pid: string) => {
    setIsLoadingNasa(true);
    try {
      const res = await fetch(`/api/nasa-power?preset=${pid}`);
      const data: FusedFieldData = await res.json();
      setFieldData(data);
    } catch (err) {
      console.error("Failed to fetch NASA data:", err);
    } finally {
      setIsLoadingNasa(false);
    }
  }, []);

  useEffect(() => {
    fetchNasaData(presetId);
  }, [presetId, fetchNasaData]);

  // ── Capture frame from camera ──
  const handleFrameCapture = useCallback((canvas: HTMLCanvasElement) => {
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setCapturedImage(dataUrl);
    } catch {
      // Canvas tainted or empty
    }
  }, []);

  // ── Generate quick fallback dirt image if camera not captured yet ──
  const getOrGenerateImage = useCallback(() => {
    if (capturedImage) return capturedImage;
    try {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 240;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#5C4033";
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = "#3e2723";
        for (let i = 0; i < 200; i++) {
          ctx.fillRect(Math.random() * 320, Math.random() * 240, 3, 3);
        }
        return c.toDataURL("image/jpeg", 0.7);
      }
    } catch {
      // fallback
    }
    return null;
  }, [capturedImage]);

  // ── Analyze with Gemini (Soil Voice) ──
  const analyzeSoil = useCallback(async () => {
    if (!fieldData) return;
    setIsLoadingVoice(true);
    try {
      const img = getOrGenerateImage();
      const res = await fetch("/api/soil-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: img,
          nasaData: fieldData,
          language,
          farmerPriorities: priorities,
        }),
      });
      const data: SoilVoiceResponse = await res.json();
      setSoilVoice(data);
      setIsSpeaking(true); // Auto-play speech when soil speaks
    } catch (err) {
      console.error("Soil Voice error:", err);
    } finally {
      setIsLoadingVoice(false);
    }
  }, [fieldData, getOrGenerateImage, language, priorities]);

  // ── Try real camera first, fall back to simulate ──
  useEffect(() => {
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setSimulateCamera(true);
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        stream.getTracks().forEach((t) => t.stop());
        setSimulateCamera(false);
      } catch {
        setSimulateCamera(true);
      }
    })();
  }, []);

  // ── Render ──
  return (
    <div className="h-dvh w-full bg-black text-white overflow-hidden flex flex-col font-sans select-none">
      {/* ── Top Bar ── */}
      <header className="relative z-40 flex items-center justify-between px-4 py-2 bg-black/75 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌾</span>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Field Shift AR
              <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                NASA
              </span>
            </h1>
            <p className="text-[10px] text-white/50 hidden sm:block">
              The Living Field Lens · Orbital to 1-cm Downscaling
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center bg-white/10 rounded-full p-0.5 border border-white/10 shadow-inner">
          <button
            onClick={() => setMode("ar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              mode === "ar"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            AR Field Lens
          </button>
          <button
            onClick={() => setMode("inspector")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              mode === "inspector"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-white/60 hover:text-white"
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Judge Inspector
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 relative overflow-hidden">
        {mode === "ar" ? (
          /* ════════ MODE A: AR FIELD LENS ════════ */
          <div className="relative h-full">
            {/* Camera / Simulation */}
            <ARCamera
              simulateMode={simulateCamera}
              onFrame={handleFrameCapture}
            />

            {/* NASA Wireframe Grid Overlay */}
            <NASAGridOverlay preset={fieldData?.preset ?? null} />

            {/* ── HUD Overlay ── */}
            <div className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none">
              {/* Top HUD */}
              <div className="pointer-events-auto p-3 space-y-2 max-w-xl">
                {/* Preset Selector */}
                <div className="flex gap-2 flex-wrap items-center">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPresetId(p.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md transition-all ${
                        presetId === p.id
                          ? "bg-amber-600/90 text-white border border-amber-400/50 shadow-md shadow-amber-900/40"
                          : "bg-black/50 text-white/70 border border-white/10 hover:bg-black/70"
                      }`}
                    >
                      <MapPin className="w-3 h-3 text-amber-400" />
                      {p.id === "eth-crv-teff"
                        ? "Ethiopia: Central Rift Valley"
                        : "Nevada: Humboldt Basin"}
                    </button>
                  ))}
                </div>

                {/* Live NASA POWER Data Badges */}
                {fieldData && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <Badge
                      label="T2M"
                      value={`${fieldData.latestPower.T2M.toFixed(1)}°C`}
                    />
                    <Badge
                      label="Precip"
                      value={`${fieldData.latestPower.PRECTOTCORR.toFixed(1)} mm`}
                    />
                    <Badge
                      label="Solar"
                      value={`${fieldData.latestPower.ALLSKY_SFC_SW_DWN.toFixed(1)} MJ/m²`}
                    />
                    <Badge
                      label="RH"
                      value={`${fieldData.latestPower.RH2M.toFixed(0)}%`}
                    />
                    <Badge
                      label="Date"
                      value={fieldData.latestPower.date || "Live"}
                    />
                    {isLoadingNasa && (
                      <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-black/40 px-2 py-0.5 rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Syncing…
                      </span>
                    )}
                  </div>
                )}

                {/* Ground Truth Calibration Badge (if soil analyzed) */}
                {soilVoice?.groundTruthCalibration && (
                  <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md rounded-xl px-3 py-1.5 text-xs text-emerald-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong className="text-white">Ground Calibration:</strong>{" "}
                      Uncertainty reduced from ±
                      {soilVoice.groundTruthCalibration.uncertaintyReduction.satelliteOnlyPct}%{" "}
                      ➔ ±
                      {soilVoice.groundTruthCalibration.uncertaintyReduction.fusedPct}%{" "}
                      · Residue: {soilVoice.groundTruthCalibration.residueCoverPct}% · Cracking:{" "}
                      {soilVoice.groundTruthCalibration.surfaceCrackSeverity}
                    </span>
                  </div>
                )}

                {/* Controls: Camera Mode Toggle & Language Selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSimulateCamera(!simulateCamera)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-black/50 backdrop-blur-md border border-white/10 hover:bg-black/70 transition-colors"
                  >
                    {simulateCamera ? (
                      <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Monitor className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {simulateCamera ? "Switch to Live Camera" : "Simulate Field Dirt"}
                  </button>

                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className="appearance-none pl-7 pr-3 py-1.5 rounded-full text-xs bg-black/50 backdrop-blur-md border border-white/10 text-white cursor-pointer hover:bg-black/70"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l} className="bg-zinc-900 text-white">
                          {l}
                        </option>
                      ))}
                    </select>
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Bottom HUD */}
              <div className="pointer-events-auto space-y-2 pb-16 max-w-xl mx-auto w-full">
                {/* Farmer Priority Sliders */}
                <PrioritySliders
                  priorities={priorities}
                  onChange={setPriorities}
                />

                {/* Action Button: Let the Soil Speak */}
                <div className="px-4">
                  <button
                    onClick={analyzeSoil}
                    disabled={isLoadingVoice || !fieldData}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white font-bold text-sm flex items-center justify-center gap-2 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 transition-all shadow-xl shadow-amber-950/60 active:scale-[0.99] border border-amber-400/30"
                  >
                    {isLoadingVoice ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        Fusing 1-cm Snapshot with NASA Satellite Data…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <Mic className="w-4 h-4 text-white" />
                        Let the Soil Speak ({language})
                      </>
                    )}
                  </button>
                </div>

                {/* Soil Speaker Waveform & TTS Playback */}
                {soilVoice && (
                  <SoilSpeaker
                    script={soilVoice.firstPersonScript}
                    subtitles={soilVoice.englishSubtitles}
                    language={language}
                    isPlaying={isSpeaking}
                    onToggle={() => setIsSpeaking(!isSpeaking)}
                  />
                )}
              </div>
            </div>

            {/* Swipeable 3-Card Strategy Drawer */}
            {soilVoice?.strategies && (
              <StrategyDrawer strategies={soilVoice.strategies} />
            )}
          </div>
        ) : (
          /* ════════ MODE B: JUDGE INSPECTOR ════════ */
          <InspectorView
            preset={fieldData?.preset ?? null}
            strategies={soilVoice?.strategies ?? []}
          />
        )}
      </main>
    </div>
  );
}

// ── Reusable Data Badge ──
function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs">
      <span className="text-white/50 font-medium">{label}:</span>
      <span className="text-cyan-300 font-semibold tabular-nums">{value}</span>
    </span>
  );
}

"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
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
  ChevronDown,
  Target,
  SlidersHorizontal,
} from "lucide-react";
import { PRESETS } from "@/lib/presets";
import {
  AppMode,
  FarmerPriorities,
  FusedFieldData,
  Language,
  SoilVoiceResponse,
  SoilMood,
} from "@/lib/types";
import { useSoilVoice } from "@/lib/useSoilVoice";
import { annotateStrategiesWithScores } from "@/lib/strategyScoring";
import ARCamera from "./components/ARCamera";
import NASAGridOverlay from "./components/NASAGridOverlay";
import ArGroundCanvas from "./components/ArGroundCanvas";
import SoilSpeaker from "./components/SoilSpeaker";
import PrioritySliders from "./components/PrioritySliders";
import StrategyDrawer from "./components/StrategyDrawer";
import InspectorView from "./components/InspectorView";
import FarmerQuestionBar from "./components/FarmerQuestionBar";

const LANGUAGES: Language[] = ["English", "Amharic", "Afaan Oromo", "Spanish"];

export default function Home() {
  // ── State ──
  const [mode, setMode] = useState<AppMode>("ar");
  const [simulateCamera, setSimulateCamera] = useState(true);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [language, setLanguage] = useState<Language>("English");
  const [priorities, setPriorities] = useState<FarmerPriorities>({
    waterConservation: 75,
    soilNitrogen: 60,
    cashIncome: 55,
    livestockForage: 40,
  });

  const [fieldData, setFieldData] = useState<FusedFieldData | null>(null);
  const [soilVoice, setSoilVoice] = useState<SoilVoiceResponse | null>(null);
  const [soilMood, setSoilMood] = useState<SoilMood>("stressed");
  const [lastFarmerQuestion, setLastFarmerQuestion] = useState<string>("");
  const [isLoadingNasa, setIsLoadingNasa] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // ── UI Collapsible States (Declutter Camera Feed) ──
  const [showTopDetails, setShowTopDetails] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [selectedStrategyIndex, setSelectedStrategyIndex] = useState(0);

  // ── 3-Tier Soil Voice & Audio Frequency Hook ──
  const { speakSoil, stopSoil, isSpeaking, frequencyData } = useSoilVoice();

  // ── Real-time Strategy Scoring against Farmer Priorities ──
  const { scoredStrategies, bestMatchIndex } = useMemo(() => {
    const list = soilVoice?.strategies || [];
    return annotateStrategiesWithScores(list, priorities);
  }, [soilVoice?.strategies, priorities]);

  // Keep selected strategy aligned with best match on priority shift
  useEffect(() => {
    setSelectedStrategyIndex(bestMatchIndex);
  }, [bestMatchIndex]);

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

  // ── Quick fallback dirt image if camera not captured yet ──
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
  const analyzeSoil = useCallback(
    async (optionalQuestion?: string) => {
      if (!fieldData) return;
      setIsLoadingVoice(true);
      if (optionalQuestion) setLastFarmerQuestion(optionalQuestion);

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
            farmerQuestion: optionalQuestion || undefined,
          }),
        });
        const data: SoilVoiceResponse = await res.json();
        setSoilVoice(data);
        if (data.mood) setSoilMood(data.mood);

        // Trigger 3-tier speech synthesis
        await speakSoil({
          text: data.firstPersonScript,
          language,
          audioBase64: data.audioBase64,
        });
      } catch (err) {
        console.error("Soil Voice error:", err);
      } finally {
        setIsLoadingVoice(false);
      }
    },
    [fieldData, getOrGenerateImage, language, priorities, speakSoil]
  );

  // ── Two-Way Farmer Interaction (Talk Back to Soil) ──
  const handleFarmerQuestion = useCallback(
    (question: string) => {
      analyzeSoil(question);
    },
    [analyzeSoil]
  );

  // ── Camera initialization ──
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

  const activePreset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const bestMatchStrategy = scoredStrategies[bestMatchIndex];

  return (
    <div className="h-dvh w-full bg-black text-white overflow-hidden flex flex-col font-sans select-none">
      {/* ── Main Viewport Shell ── */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {mode === "ar" ? (
          /* ════════ MODE A: LOCKED MOBILE APK VIEWPORT SHELL (DECLUTTERED) ════════ */
          <div className="h-[100dvh] w-full max-w-[430px] mx-auto overflow-hidden select-none overscroll-none relative pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] flex-1 flex flex-col bg-black shadow-2xl">
            {/* Full-bleed Camera / Dirt Simulation (75%+ clear view) */}
            <ARCamera
              simulateMode={simulateCamera}
              onFrame={handleFrameCapture}
            />

            {/* NASA 3D Wireframe Grid Overlay on Ground */}
            <NASAGridOverlay preset={fieldData?.preset ?? null} />

            {/* Living AR Soil Face with Mood ("stressed" | "hopeful" | "thriving") & Acoustic Ripples */}
            <ArGroundCanvas
              activeStrategyIndex={selectedStrategyIndex}
              frequencyData={frequencyData}
              isSpeaking={isSpeaking}
              mood={soilMood}
              nasaMetrics={{
                smapMoisture: fieldData?.preset.smap_rootzone_mm?.slice(-1)[0],
                ecostressEsi: fieldData?.preset.ecostress_esi?.slice(-1)[0],
                landsatNdvi: fieldData?.preset.landsat_ndvi
                  ? Math.max(...fieldData.preset.landsat_ndvi)
                  : undefined,
                landsatBsi: fieldData?.preset.landsat_bsi
                  ? Math.max(...fieldData.preset.landsat_bsi)
                  : undefined,
                srtmSlope: fieldData?.preset.srtm_slope_deg,
                temp: fieldData?.latestPower.T2M,
                precip: fieldData?.latestPower.PRECTOTCORR,
                solar: fieldData?.latestPower.ALLSKY_SFC_SW_DWN,
              }}
              groundTruth={soilVoice?.groundTruthCalibration ?? null}
            />

            {/* ── SLEEK COLLAPSIBLE TOP BAR ── */}
            <div className="relative z-30 pointer-events-auto p-2.5 pb-1">
              <div className="bg-black/75 backdrop-blur-xl rounded-2xl border border-white/10 shadow-lg px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                {/* Location Pill Selector */}
                <div className="relative shrink-0">
                  <select
                    value={presetId}
                    onChange={(e) => setPresetId(e.target.value)}
                    className="appearance-none bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold pl-6 pr-5 py-1 rounded-full cursor-pointer transition-colors border border-white/10 focus:outline-none"
                  >
                    {PRESETS.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-900 text-white text-xs">
                        {p.id === "eth-crv-teff" ? "🇪🇹 Rift Valley" : "🇺🇸 Nevada Plot"}
                      </option>
                    ))}
                  </select>
                  <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-400 pointer-events-none" />
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/50 pointer-events-none" />
                </div>

                {/* Compressed Weather Ticker Pill (Tap to Expand Details) */}
                <button
                  onClick={() => setShowTopDetails(!showTopDetails)}
                  className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-full border border-white/10 text-[11px] font-mono text-cyan-200 transition-colors truncate"
                  title="Toggle satellite & weather metrics"
                >
                  {fieldData ? (
                    <>
                      <span>{fieldData.latestPower.T2M.toFixed(0)}°C</span>
                      <span className="text-white/30">·</span>
                      <span>{fieldData.latestPower.PRECTOTCORR.toFixed(1)}mm</span>
                      <span className="text-white/30">·</span>
                      <span>{fieldData.latestPower.ALLSKY_SFC_SW_DWN.toFixed(0)}MJ</span>
                      <span className="text-white/30">·</span>
                      <span>{fieldData.latestPower.RH2M.toFixed(0)}%</span>
                    </>
                  ) : (
                    <span>Syncing NASA…</span>
                  )}
                  <ChevronDown
                    className={`w-3 h-3 text-cyan-400 transition-transform ${
                      showTopDetails ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Mode Toggle (AR / Inspector) */}
                <button
                  onClick={() => setMode("inspector")}
                  className="flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 text-[11px] font-medium px-2 py-1 rounded-full border border-cyan-800/50 shadow-sm shrink-0"
                >
                  <FlaskConical className="w-3 h-3" />
                  <span>Inspect</span>
                </button>
              </div>

              {/* Collapsible Detailed Metrics Tray */}
              {showTopDetails && (
                <div className="mt-1.5 bg-black/90 backdrop-blur-2xl rounded-2xl p-3 border border-cyan-500/30 text-xs space-y-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between text-[11px] text-white/60 pb-1.5 border-b border-white/10">
                    <span className="font-semibold text-white">Live Agroclimatology</span>
                    <span>Date: {fieldData?.latestPower.date || "Live"}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <MiniMetric label="Temp" val={`${fieldData?.latestPower.T2M.toFixed(1)}°C`} />
                    <MiniMetric label="Precip" val={`${fieldData?.latestPower.PRECTOTCORR.toFixed(1)}mm`} />
                    <MiniMetric label="Solar" val={`${fieldData?.latestPower.ALLSKY_SFC_SW_DWN.toFixed(1)}MJ`} />
                    <MiniMetric label="Humidity" val={`${fieldData?.latestPower.RH2M.toFixed(0)}%`} />
                  </div>

                  {/* Satellite Arrays */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] pt-1">
                    <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                      <span className="text-white/50 block">SMAP Root</span>
                      <strong className="text-cyan-300">
                        {activePreset.smap_rootzone_mm[activePreset.smap_rootzone_mm.length - 1]} mm
                      </strong>
                    </div>
                    <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                      <span className="text-white/50 block">ECOSTRESS</span>
                      <strong className="text-amber-300">
                        {activePreset.ecostress_esi[activePreset.ecostress_esi.length - 1]} ESI
                      </strong>
                    </div>
                    <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                      <span className="text-white/50 block">Landsat BSI</span>
                      <strong className="text-red-300">
                        {activePreset.landsat_bsi[activePreset.landsat_bsi.length - 1]} BSI
                      </strong>
                    </div>
                  </div>

                  {/* Ground Truth Calibration Badge */}
                  {soilVoice?.groundTruthCalibration && (
                    <div className="flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl px-2.5 py-1 text-[11px] text-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        ±{soilVoice.groundTruthCalibration.uncertaintyReduction.satelliteOnlyPct}% ➔ ±
                        {soilVoice.groundTruthCalibration.uncertaintyReduction.fusedPct}% Uncertainty · Residue:{" "}
                        {soilVoice.groundTruthCalibration.residueCoverPct}%
                      </span>
                    </div>
                  )}

                  {/* Close button */}
                  <button
                    onClick={() => setShowTopDetails(false)}
                    className="w-full text-center text-[10px] text-cyan-400/80 hover:text-cyan-300 pt-1"
                  >
                    ▲ Collapse Metrics
                  </button>
                </div>
              )}
            </div>

            {/* ── FLOATING QUICK PILLS (Farm Goals & Language) ── */}
            <div className="relative z-20 pointer-events-auto px-3 flex items-center justify-between gap-2 mt-1">
              {/* Collapsible Farmer Priorities Button */}
              <button
                onClick={() => setShowPriorityModal(true)}
                className="flex items-center gap-1.5 bg-black/65 hover:bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-500/40 text-xs font-semibold text-amber-200 shadow-md active:scale-95 transition-all"
              >
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>🎯 Farm Goals</span>
                {bestMatchStrategy && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-mono">
                    {bestMatchStrategy.matchScore}%
                  </span>
                )}
              </button>

              {/* Language & Camera Toggle Quick Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSimulateCamera(!simulateCamera)}
                  className="p-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-white/70 hover:text-white transition-colors"
                  title={simulateCamera ? "Switch to Real Camera" : "Simulate Field Dirt"}
                >
                  {simulateCamera ? (
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <Monitor className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </button>

                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="appearance-none pl-6 pr-3 py-1 rounded-full text-[11px] bg-black/65 backdrop-blur-md border border-white/10 text-white cursor-pointer hover:bg-black/80"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-zinc-900 text-white text-xs">
                        {l}
                      </option>
                    ))}
                  </select>
                  <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/60 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* ── 75%+ UNOBSTRUCTED CENTER VIEWPORT ── */}
            <div className="flex-1 pointer-events-none" />

            {/* ── BOTTOM HUD CONTROLS ── */}
            <div className="relative z-20 pointer-events-auto space-y-1.5 pb-12 w-full">
              {/* Two-Way Farmer Interaction (Ask Questions to Soil) */}
              <FarmerQuestionBar
                onAskQuestion={handleFarmerQuestion}
                isLoading={isLoadingVoice}
                currentMood={soilMood}
                lastQuestion={lastFarmerQuestion}
                language={language}
              />

              {/* Action Button: Let the Soil Speak */}
              <div className="px-3">
                <button
                  onClick={() => analyzeSoil()}
                  disabled={isLoadingVoice || !fieldData}
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 transition-all shadow-xl shadow-amber-950/60 active:scale-[0.99] border border-amber-400/30"
                >
                  {isLoadingVoice ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      Listening to Soil Fusing 1-cm with NASA Data…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <Mic className="w-3.5 h-3.5 text-white" />
                      Listen to Soil Monologue ({language})
                    </>
                  )}
                </button>
              </div>

              {/* Soil Speaker Waveform & Subtitles (Clean clearance above drawer tab) */}
              {soilVoice && (
                <SoilSpeaker
                  script={soilVoice.firstPersonScript}
                  subtitles={soilVoice.englishSubtitles}
                  language={language}
                  isPlaying={isSpeaking}
                  frequencyData={frequencyData}
                  onToggle={() => {
                    if (isSpeaking) {
                      stopSoil();
                    } else {
                      speakSoil({
                        text: soilVoice.firstPersonScript,
                        language,
                        audioBase64: soilVoice.audioBase64,
                      });
                    }
                  }}
                />
              )}
            </div>

            {/* ── SWIPEABLE 3-CARD STRATEGY DRAWER ── */}
            {scoredStrategies.length > 0 && (
              <StrategyDrawer
                strategies={scoredStrategies}
                activeIndex={selectedStrategyIndex}
                onSelectStrategy={setSelectedStrategyIndex}
              />
            )}

            {/* ── COLLAPSIBLE FARMER PRIORITIES MODAL SHEET ── */}
            {showPriorityModal && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150">
                <div className="w-full max-w-sm">
                  <PrioritySliders
                    priorities={priorities}
                    onChange={setPriorities}
                    onClose={() => setShowPriorityModal(false)}
                    bestMatchStrategyName={bestMatchStrategy?.name}
                    bestMatchScore={bestMatchStrategy?.matchScore}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ════════ MODE B: JUDGE INSPECTOR VIEW ════════ */
          <div className="flex-1 overflow-y-auto">
            {/* Header back to AR */}
            <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-2 bg-black/85 backdrop-blur-md border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌾</span>
                <span className="text-sm font-bold text-white">Judge Inspector</span>
              </div>
              <button
                onClick={() => setMode("ar")}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Return to AR Lens
              </button>
            </header>

            <InspectorView
              preset={fieldData?.preset ?? null}
              strategies={scoredStrategies}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function MiniMetric({ label, val }: { label: string; val: string }) {
  return (
    <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
      <span className="text-white/50 block text-[9px] uppercase tracking-wider">{label}</span>
      <strong className="text-white text-[11px] font-mono">{val}</strong>
    </div>
  );
}

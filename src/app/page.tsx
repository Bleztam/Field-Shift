"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Eye, Loader2 } from "lucide-react";
import { PRESETS } from "@/lib/presets";
import {
  AppMode,
  FarmerPriorities,
  FusedFieldData,
} from "@/lib/types";
import { annotateStrategiesWithScores } from "@/lib/strategyScoring";
import { getCurrentSeason, SeasonInfo } from "@/lib/soilSeason";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";
import { vibrate } from "@/lib/haptics";
import { useSoilConversation } from "@/lib/useSoilConversation";
import {
  AddisLanguageCode,
  RegionKey,
  SUPPORTED_LANGUAGES,
  loadSavedLanguage,
  saveLanguageChoice,
  resolveLanguage,
} from "@/lib/languageConfig";
import {
  FarmerLocation,
  choiceToLocation,
  getLiveLocation,
  loadSavedLocation,
  saveLocation,
} from "@/lib/location";
import ARCamera, { CameraStatus } from "./components/ARCamera";
import SoilFace from "./components/soil/SoilFace";
import SoilCaptions from "./components/soil/SoilCaptions";
import CropLensCarousel from "./components/soil/CropLensCarousel";
import PushToTalk from "./components/soil/PushToTalk";
import TextQuestionTray from "./components/soil/TextQuestionTray";
import VerdictBadge from "./components/soil/VerdictBadge";
import TopStatusBar from "./components/soil/TopStatusBar";
import WhySheet from "./components/soil/WhySheet";
import PermissionPrimer from "./components/soil/PermissionPrimer";
import LanguageSheet from "./components/soil/LanguageSheet";
import RegionPickerSheet from "./components/soil/RegionPickerSheet";
import InspectorView from "./components/InspectorView";
import { CROP_LENSES } from "@/lib/soilUiStrings";

const INSPECTOR_DEMO_PRIORITIES: FarmerPriorities = {
  waterConservation: 70,
  soilNitrogen: 60,
  cashIncome: 55,
  livestockForage: 40,
};
const ONBOARDED_KEY = "soilSpeaks:onboarded";

/** Crop lens chip id → canonical crop id sent to the backend. */
const LENS_TO_CANONICAL: Record<string, string> = {
  teff: "teff",
  maize: "maize",
  chickpea: "chickpea",
  wheat: "wheat",
  sorghum: "sorghum",
  haricot: "haricot_bean",
};

export default function Home() {
  const [mode, setMode] = useState<AppMode>("ar");
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [fieldData, setFieldData] = useState<FusedFieldData | null>(null);
  const [, setCameraStatus] = useState<CameraStatus>("pending");
  const [showEnglish, setShowEnglish] = useState(true);
  const [whyOpen, setWhyOpen] = useState(false);
  const [textTrayOpen, setTextTrayOpen] = useState(false);
  const [primerDone, setPrimerDone] = useState(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const swipeStartY = useRef<number | null>(null);

  // ── Location + language state ──
  const [farmerLocation, setFarmerLocation] = useState<FarmerLocation | null>(null);
  const [regionKey, setRegionKey] = useState<RegionKey | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [languageCode, setLanguageCode] = useState<AddisLanguageCode>("am");
  const [langSuggested, setLangSuggested] = useState(false);
  const [savedLang, setSavedLang] = useState<AddisLanguageCode | null>(null);
  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  const farmerLocationRef = useRef<FarmerLocation | null>(null);
  useEffect(() => {
    farmerLocationRef.current = farmerLocation;
  }, [farmerLocation]);

  // ── First-launch onboarding flag ──
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDED_KEY)) setPrimerDone(false);
    } catch {
      // private mode — show primer every launch, harmless
      setPrimerDone(false);
    }
    setSavedLang(loadSavedLanguage());
  }, []);

  const handleFrameCapture = useCallback((canvas: HTMLCanvasElement) => {
    try {
      setCapturedImage(canvas.toDataURL("image/jpeg", 0.7));
    } catch {
      // tainted/empty canvas — ignore
    }
  }, []);

  // Quiet fallback frame for the backend payload when no camera is available.
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
      // ignore
    }
    return null;
  }, [capturedImage]);

  const conv = useSoilConversation({
    fieldData,
    language: languageCode,
    getImage: getOrGenerateImage,
    getLocation: () => {
      const loc = farmerLocationRef.current;
      return loc ? { lat: loc.lat, lon: loc.lon, source: loc.source } : null;
    },
  });

  const isDemo = conv.demo.nocamera === true || conv.demo.state !== undefined;

  // ── Location resolution: live → saved → picker. Demo mode keeps the
  // flagship preset (dev/demo only — never presented as the farmer's field).
  useEffect(() => {
    if (isDemo) {
      const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
      setFarmerLocation({
        lat: p.lat,
        lon: p.lon,
        source: "demo",
        regionName: p.region,
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const live = await getLiveLocation();
      if (cancelled) return;
      if (live) {
        saveLocation(live);
        setFarmerLocation(live);
        return;
      }
      const saved = loadSavedLocation();
      if (cancelled) return;
      if (saved) {
        setFarmerLocation(saved);
        if (saved.regionKey) setRegionKey(saved.regionKey);
        if (saved.regionName) setRegionName(saved.regionName);
      } else {
        setRegionPickerOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  // ── NASA POWER for the resolved location (preset arrays only in demo) ──
  useEffect(() => {
    if (!farmerLocation) return;
    let cancelled = false;
    const url =
      farmerLocation.source === "demo"
        ? `/api/nasa-power?preset=${presetId}`
        : `/api/nasa-power?lat=${farmerLocation.lat}&lon=${farmerLocation.lon}`;
    (async () => {
      try {
        const res = await fetch(url);
        const data: FusedFieldData = await res.json();
        if (!cancelled) setFieldData(data);
      } catch {
        // offline — conversation hook handles cached path
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmerLocation, presetId]);

  // ── Region lookup when the source didn't provide one (live/saved GPS) ──
  useEffect(() => {
    if (!farmerLocation || farmerLocation.source === "demo" || farmerLocation.regionKey) {
      if (farmerLocation?.regionKey) {
        setRegionKey(farmerLocation.regionKey);
        if (farmerLocation.regionName) setRegionName(farmerLocation.regionName);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/region?lat=${farmerLocation.lat}&lon=${farmerLocation.lon}`
        );
        const data = (await res.json()) as {
          regionKey?: RegionKey;
          regionName?: string | null;
        };
        if (cancelled) return;
        if (data.regionKey && data.regionKey !== "unknown") {
          setRegionKey(data.regionKey);
          setRegionName(data.regionName ?? null);
          const loc = farmerLocationRef.current;
          if (loc) {
            saveLocation({
              ...loc,
              regionKey: data.regionKey,
              regionName: data.regionName ?? undefined,
            });
          }
        }
      } catch {
        // region stays unknown → language falls back to saved/Amharic
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerLocation]);

  // ── Spoken language: saved choice > region default > Amharic ──
  // (demo/preset mode never drives the language)
  useEffect(() => {
    const resolved = resolveLanguage(savedLang, isDemo ? null : regionKey);
    setLanguageCode(resolved.code);
    setLangSuggested(resolved.suggested);
  }, [savedLang, regionKey, isDemo]);

  const onSelectLanguage = useCallback((code: AddisLanguageCode) => {
    saveLanguageChoice(code);
    setSavedLang(code);
    setLanguageCode(code);
    setLangSuggested(false);
    setLangSheetOpen(false);
  }, []);

  // Demo/QA overrides via query params (used by the screenshot script).
  useEffect(() => {
    if (conv.demo.why) setWhyOpen(true);
    if (conv.demo.langSheet) setLangSheetOpen(true);
    if (conv.demo.regionSheet) setRegionPickerOpen(true);
    if (conv.demo.onboarding) setPrimerDone(false);
  }, [conv.demo]);

  // Season resolved client-side after mount (prerender must not call Date()).
  const [season, setSeason] = useState<SeasonInfo>({
    id: "bega",
    labelAm: "በጋ",
    labelEn: "Bega dry season",
  });
  useEffect(() => {
    setSeason(getCurrentSeason());
  }, []);
  const activePreset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const langStrings = SUPPORTED_LANGUAGES[languageCode];

  // ── Swipe up anywhere calm → Why sheet ──
  const onRootTouchStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
  };
  const onRootTouchEnd = (e: React.TouchEvent) => {
    if (swipeStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const target = e.target as HTMLElement;
    const inCarousel = Boolean(target.closest?.(".crop-carousel"));
    if (dy < -70 && !inCarousel) setWhyOpen(true);
    swipeStartY.current = null;
  };

  // ── Judge inspector data (strategies may be absent until first answer) ──
  const strategies = conv.soilVoice?.strategies ?? [];
  const { scoredStrategies } = useMemo(
    () =>
      annotateStrategiesWithScores(
        strategies.length === 3 ? strategies : [],
        INSPECTOR_DEMO_PRIORITIES
      ),
    [strategies]
  );

  if (mode === "inspector") {
    return (
      <div className="soil-app fixed inset-0 overflow-y-auto">
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
          style={{ background: "var(--soil-scrim-strong)" }}
        >
          <span className="text-sm font-extrabold">🌾 Judge Inspector</span>
          <button
            type="button"
            onClick={() => setMode("ar")}
            className="flex items-center gap-1.5 px-4 rounded-full text-xs font-bold text-white"
            style={{ background: "var(--soil-amber)", minHeight: 44 }}
          >
            <Eye className="w-3.5 h-3.5" />
            Back to the field
          </button>
        </header>
        {fieldData && scoredStrategies.length === 3 ? (
          <InspectorView preset={fieldData.preset} strategies={scoredStrategies} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 h-2/3 p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm opacity-80">
              Ask the soil a question first — rotation strategies load with the
              first answer.
            </p>
          </div>
        )}
      </div>
    );
  }

  const busy = conv.uiState === "thinking" || conv.uiState === "listening";
  const selectedCrop = CROP_LENSES.find((c) => c.id === selectedCropId);
  const locationLabel =
    farmerLocation?.regionName ?? regionName ?? activePreset.region;

  return (
    <div
      className="soil-app fixed inset-0 overflow-hidden select-none"
      onTouchStart={onRootTouchStart}
      onTouchEnd={onRootTouchEnd}
    >
      {/* 1 · live rear-camera backdrop; illustrated ground only when the
              camera is denied, missing, or the stream fails */}
      <ARCamera
        onFrame={handleFrameCapture}
        onStatus={setCameraStatus}
        forceFallback={!primerDone || conv.demo.nocamera === true}
      />

      {/* 2 · top status bar */}
      <TopStatusBar
        season={season}
        locationName={locationLabel}
        locationSource={farmerLocation?.source ?? null}
        onOpenLocation={() => setRegionPickerOpen(true)}
        powerLive={Boolean(fieldData?.latestPower)}
        isOnline={conv.isOnline}
        languageCode={languageCode}
        onOpenLanguage={() => setLangSheetOpen(true)}
        showEnglish={showEnglish}
        onToggleEnglish={() => setShowEnglish((v) => !v)}
        onOpenWhy={() => setWhyOpen(true)}
      />

      {/* verdict badge after an answered crop question */}
      {conv.soilVoice?.verdict && conv.uiState !== "thinking" && (
        <VerdictBadge
          verdict={conv.soilVoice.verdict}
          cropLabelAm={selectedCrop?.labelAm}
        />
      )}

      {/* 4 · captions — active language large, English toggleable */}
      <SoilCaptions
        amharic={conv.captionAm}
        english={conv.captionEn}
        speaking={conv.isSpeaking}
        showEnglish={showEnglish}
        onTap={() => {
          if (conv.isSpeaking) conv.stopSoil();
          else conv.replayCurrent();
        }}
      />

      {/* 3 · the living soil character */}
      <div className="soil-stage">
        <SoilFace
          mood={conv.mood}
          uiState={conv.uiState}
          mouthLevel={conv.mouthLevel}
          onTap={() => vibrate(10)}
        />
      </div>

      {/* offline / error toasts — friendly, never technical */}
      {conv.uiState === "offline" && (
        <div className="soil-toast" role="status">
          <p className="am" lang="am">{SOIL_STRINGS.offlineTitle.am}</p>
          <p className="en">{SOIL_STRINGS.offlineBody.en}</p>
        </div>
      )}
      {conv.uiState === "error" && (
        <div className="soil-toast" role="alert">
          <p className="am" lang="am">{langStrings.errorBody}</p>
          <p className="en">{SOIL_STRINGS.errorBody.en}</p>
          <button
            type="button"
            className="retry"
            style={{ minHeight: 56 }}
            onClick={() => conv.askQuestion(conv.lastQuestion)}
          >
            <span className="soil-am" lang="am">{SOIL_STRINGS.retry.am}</span>
            {" · "}
            {SOIL_STRINGS.retry.en}
          </button>
        </div>
      )}

      {/* 5 · bottom deck: crop lens carousel + big PTT */}
      <div className="soil-deck">
        <CropLensCarousel
          selectedCropId={selectedCropId}
          disabled={busy}
          onAskCrop={(question, cropId) => {
            setSelectedCropId(cropId);
            void conv.askQuestion(question, LENS_TO_CANONICAL[cropId] ?? null);
          }}
        />
        <PushToTalk
          held={conv.uiState === "listening"}
          micLevels={conv.micLevels}
          srSupported={conv.srSupported}
          disabled={conv.uiState === "thinking"}
          onHoldStart={conv.startListening}
          onHoldEnd={conv.stopListening}
          onOpenText={() => setTextTrayOpen(true)}
        />
      </div>

      {/* text fallback (existing input path) */}
      <TextQuestionTray
        open={textTrayOpen}
        disabled={conv.uiState === "thinking"}
        onSend={(q) => void conv.askQuestion(q)}
        onClose={() => setTextTrayOpen(false)}
      />

      {/* 6 · Why bottom sheet */}
      <WhySheet
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        fieldData={fieldData}
        soilVoice={conv.soilVoice}
        season={season}
        presetName={activePreset.name}
        locationSource={farmerLocation?.source ?? null}
        regionName={regionName ?? farmerLocation?.regionName ?? null}
        languageLabel={`${langStrings.nativeName} (${langStrings.englishName})`}
        onSwitchPreset={() => {
          const next =
            presetId === PRESETS[0].id ? PRESETS[1].id : PRESETS[0].id;
          setPresetId(next);
          const p = PRESETS.find((x) => x.id === next) ?? PRESETS[0];
          setFarmerLocation({
            lat: p.lat,
            lon: p.lon,
            source: "demo",
            regionName: p.region,
          });
        }}
        onOpenInspector={() => setMode("inspector")}
      />

      {/* language picker */}
      <LanguageSheet
        open={langSheetOpen}
        activeCode={languageCode}
        suggestedCode={
          langSuggested ? languageCode : conv.demo.langSheet ? "om" : null
        }
        onSelect={onSelectLanguage}
        onClose={() => setLangSheetOpen(false)}
      />

      {/* region picker — blocking when no location is known; tappable
          location pill re-opens it to change region */}
      <RegionPickerSheet
        open={regionPickerOpen}
        onClose={farmerLocation ? () => setRegionPickerOpen(false) : undefined}
        onPick={(choice) => {
          const loc = choiceToLocation(choice);
          saveLocation(loc);
          setFarmerLocation(loc);
          setRegionKey(choice.key);
          setRegionName(choice.labelEn);
          setRegionPickerOpen(false);
        }}
      />

      {/* first-launch permission primer */}
      {!primerDone && (
        <PermissionPrimer
          onDone={() => {
            setPrimerDone(true);
            try {
              window.localStorage.setItem(ONBOARDED_KEY, "1");
            } catch {
              // ignore
            }
          }}
        />
      )}
    </div>
  );
}

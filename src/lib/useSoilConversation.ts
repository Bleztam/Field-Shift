"use client";

// ─── "The Soil Speaks" conversation state machine ───
// idle → listening (PTT/SR) → thinking (POST /api/soil-voice) → speaking → idle
//                          ↘ offline (cached advice) / error (friendly retry)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FusedFieldData,
  Language,
  SoilMood,
  SoilVoiceResponse,
} from "./types";
import { useSoilVoice, loadLastSoilAudio } from "./useSoilVoice";
import { mapLanguageToCode } from "./languageCodes";
import { SOIL_STRINGS } from "./soilUiStrings";
import { vibrate, HAPTIC_ADVICE, HAPTIC_PRESS, HAPTIC_RELEASE } from "./haptics";
import { SoilUiState } from "@/app/components/soil/SoilFace";

const SOIL_VOICE_TIMEOUT_MS = 25_000;

const DEMO_CANNED_RESPONSE: SoilVoiceResponse = {
  groundTruthCalibration: {
    residueCoverPct: 28,
    surfaceCrackSeverity: "mild",
    uncertaintyReduction: { satelliteOnlyPct: 34, fusedPct: 11 },
  },
  mood: "hopeful",
  firstPersonScript:
    "ሰላም! እኔ አፈርህ ነኝ። አሁን ሽምብራ መትከል ትችላለህ — ትንሽ ውሃ አለኝ።",
  englishSubtitles:
    "Hello! I am your soil. You can plant chickpea now — I still hold some moisture.",
  strategies: [] as unknown as SoilVoiceResponse["strategies"],
  audioBase64: null,
  audioProvider: "none",
  verdict: "plant",
  reasons: [
    "Bare-soil erosion window opens next month; chickpea cover protects topsoil.",
    "SMAP root-zone moisture is adequate for a drought-hardy legume.",
  ],
  confidence: "medium",
  crop: "chickpea",
  intent: "plant_check",
};

interface DemoOverrides {
  state?: SoilUiState;
  mood?: SoilMood;
  why?: boolean;
  onboarding?: boolean;
  nocamera?: boolean;
}

function readDemoOverrides(): DemoOverrides {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const state = p.get("demo");
  const mood = p.get("mood");
  return {
    state: state
      ? (state as SoilUiState)
      : undefined,
    mood:
      mood === "stressed" || mood === "hopeful" || mood === "thriving"
        ? mood
        : undefined,
    why: p.get("sheet") === "why",
    onboarding: p.get("onboarding") === "1",
    nocamera: p.get("nocamera") === "1",
  };
}

interface UseSoilConversationArgs {
  fieldData: FusedFieldData | null;
  language: Language;
  getImage: () => string | null;
}

export function useSoilConversation({
  fieldData,
  language,
  getImage,
}: UseSoilConversationArgs) {
  const [uiState, setUiState] = useState<SoilUiState>("idle");
  const [mood, setMood] = useState<SoilMood>("stressed");
  const [soilVoice, setSoilVoice] = useState<SoilVoiceResponse | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [cachedCaption, setCachedCaption] = useState<string | null>(null);
  const [micLevels, setMicLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const [mouthLevel, setMouthLevel] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const humRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimRef = useRef<number>(0);
  const demo = useMemo(readDemoOverrides, []);

  const { speakSoil, stopSoil, isSpeaking, frequencyData } = useSoilVoice();

  const srSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown })
            .webkitSpeechRecognition
      ),
    []
  );

  // ── Online/offline tracking ──
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ── Demo overrides (screenshot/QA mode) ──
  useEffect(() => {
    if (demo.mood) setMood(demo.mood);
    if (demo.state === "speaking") {
      setSoilVoice(DEMO_CANNED_RESPONSE);
      if (DEMO_CANNED_RESPONSE.mood) setMood(demo.mood ?? DEMO_CANNED_RESPONSE.mood);
      setHasAnswered(true);
    }
    if (demo.state && demo.state !== "speaking") {
      setUiState(demo.state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speech recognition setup ──
  useEffect(() => {
    if (!srSupported) return;
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = mapLanguageToCode(language);
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, [srSupported, language]);

  // ── Thinking hum (no TTS credits, soft WebAudio drone) ──
  const stopHum = useCallback(() => {
    try {
      humRef.current?.gain.gain.linearRampToValueAtTime(
        0.0001,
        humRef.current.ctx.currentTime + 0.15
      );
      setTimeout(() => {
        humRef.current?.osc.stop();
        humRef.current?.ctx.close().catch(() => {});
        humRef.current = null;
      }, 220);
    } catch {
      humRef.current = null;
    }
  }, []);

  const startHum = useCallback(() => {
    try {
      const CtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!CtxClass) return;
      const ctx = new CtxClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 96;
      gain.gain.value = 0.0001;
      gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      humRef.current = { ctx, osc, gain };
    } catch {
      humRef.current = null;
    }
  }, []);

  useEffect(() => stopHum, [stopHum]);

  // ── Mic level visualizer while holding PTT ──
  const stopMicMeter = useCallback(() => {
    cancelAnimationFrame(micAnimRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setMicLevels([0, 0, 0, 0, 0]);
  }, []);

  const startMicMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const CtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!CtxClass) return;
      const ctx = new CtxClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const bars = [0, 1, 2, 3, 4].map((i) =>
          Math.min(1, (data[2 + i * 4] ?? 0) / 200)
        );
        setMicLevels(bars);
        micAnimRef.current = requestAnimationFrame(tick);
      };
      micAnimRef.current = requestAnimationFrame(tick);
      const closeCtx = () => ctx.close().catch(() => {});
      stream.getTracks().forEach((t) => t.addEventListener("ended", closeCtx, { once: true }));
    } catch {
      // mic denied — SR or text path continues regardless
    }
  }, []);

  useEffect(() => stopMicMeter, [stopMicMeter]);

  // ── Mouth level: real amplitude for audio, timed wave for browser TTS ──
  const browserVoiced = soilVoice?.audioProvider === "browser";
  useEffect(() => {
    if (!isSpeaking && !(demo.state === "speaking")) {
      setMouthLevel(0);
      return;
    }
    if (frequencyData.some((v) => v > 0)) {
      const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
      setMouthLevel(Math.min(1, avg / 160));
      return;
    }
    if (browserVoiced || demo.state === "speaking") {
      let raf = 0;
      const tick = (t: number) => {
        setMouthLevel(0.3 + Math.abs(Math.sin(t * 0.012)) * 0.55);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
  }, [isSpeaking, frequencyData, browserVoiced, demo.state]);

  // Speaking ends → back to idle
  useEffect(() => {
    if (uiState === "speaking" && !isSpeaking) {
      setUiState("idle");
    }
  }, [isSpeaking, uiState]);

  // ── Ask the soil ──
  const askQuestion = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      setLastQuestion(q);
      setCachedCaption(null);
      setUiState("thinking");
      startHum();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SOIL_VOICE_TIMEOUT_MS);
        const res = await fetch("/api/soil-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: getImage(),
            nasaData: fieldData,
            language,
            farmerQuestion: q,
          }),
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`soil-voice ${res.status}`);
        const data = (await res.json()) as SoilVoiceResponse;

        setSoilVoice(data);
        if (data.mood) setMood(data.mood);
        setHasAnswered(true);
        setUiState("speaking");
        vibrate(HAPTIC_ADVICE);
        await speakSoil({
          text: data.firstPersonScript,
          language,
          audioBase64: data.audioBase64,
        });
      } catch {
        // Offline → replay the cached answer; anything else → friendly error.
        const cached = loadLastSoilAudio();
        if (!navigator.onLine && cached) {
          setCachedCaption(cached.text);
          setUiState("offline");
          await speakSoil({
            text: cached.text,
            language: cached.language ?? language,
            audioBase64: cached.audioBase64,
          });
        } else if (!navigator.onLine) {
          setUiState("offline");
        } else {
          setUiState("error");
        }
      } finally {
        stopHum();
      }
    },
    [fieldData, getImage, language, speakSoil, startHum, stopHum]
  );

  // ── PTT handlers ──
  const startListening = useCallback(() => {
    vibrate(HAPTIC_PRESS);
    stopSoil();
    setUiState("listening");
    startMicMeter();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) void askQuestion(transcript);
        else setUiState("idle");
      };
      recognition.onerror = () => setUiState((s) => (s === "listening" ? "idle" : s));
      recognition.onend = () => setUiState((s) => (s === "listening" ? "idle" : s));
      try {
        recognition.start();
      } catch {
        // already running — ignore
      }
    }
  }, [askQuestion, startMicMeter, stopSoil]);

  const stopListening = useCallback(() => {
    vibrate(HAPTIC_RELEASE);
    stopMicMeter();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    // Without SR there is no transcript coming — return to idle.
    if (!recognitionRef.current) {
      setUiState((s) => (s === "listening" ? "idle" : s));
    }
  }, [stopMicMeter]);

  // ── Current caption text ──
  const effectiveState: SoilUiState =
    demo.state === "speaking" ? "speaking" : uiState;

  let captionAm = "";
  let captionEn = "";
  if (effectiveState === "listening") {
    captionAm = SOIL_STRINGS.listening.am;
    captionEn = SOIL_STRINGS.listening.en;
  } else if (effectiveState === "thinking") {
    captionAm = SOIL_STRINGS.thinking.am;
    captionEn = SOIL_STRINGS.thinking.en;
  } else if (uiState === "offline" && cachedCaption) {
    captionAm = cachedCaption;
    captionEn = SOIL_STRINGS.offlineBody.en;
  } else if (soilVoice?.firstPersonScript) {
    captionAm = soilVoice.firstPersonScript;
    captionEn = soilVoice.englishSubtitles;
  } else {
    captionAm = SOIL_STRINGS.greeting.am;
    captionEn = SOIL_STRINGS.greeting.en;
  }

  // Replay the current answer (caption tap).
  const replayCurrent = useCallback(async () => {
    const text = soilVoice?.firstPersonScript ?? cachedCaption;
    if (!text || uiState === "thinking") return;
    setUiState("speaking");
    await speakSoil({
      text,
      language,
      audioBase64: soilVoice?.audioBase64 ?? loadLastSoilAudio()?.audioBase64 ?? null,
    });
  }, [soilVoice, cachedCaption, uiState, speakSoil, language]);

  return {
    uiState: effectiveState,
    mood,
    soilVoice,
    captionAm,
    captionEn,
    hasAnswered,
    lastQuestion,
    isOnline,
    isSpeaking: isSpeaking || demo.state === "speaking",
    mouthLevel,
    micLevels,
    srSupported,
    demo,
    askQuestion,
    startListening,
    stopListening,
    stopSoil,
    replayCurrent,
    setUiState,
  };
}

// Minimal structural type so the hook never depends on lib.dom SpeechRecognition.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        results?: { [index: number]: { [index: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

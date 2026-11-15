"use client";

// ─── "The Soil Speaks" conversation state machine ───
// idle → listening (PTT/SR) → thinking (POST /api/soil-voice) → speaking → idle
//                          ↘ offline (cached advice) / error (friendly retry)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FusedFieldData,
  SoilMood,
  SoilVoiceResponse,
} from "./types";
import { useSoilVoice, loadLastSoilAudio } from "./useSoilVoice";
import { SOIL_STRINGS } from "./soilUiStrings";
import {
  AddisLanguageCode,
  SUPPORTED_LANGUAGES,
} from "./languageConfig";
import { FarmerLocation } from "./location";
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
    "ሰላም! እኔ አፈርህ ነኝ። ፀሐዩ ሞቃትና አየሩ ደረቅ በመሆኑ እርጥበቴ ቀንሷል፤ የምትዘራ ከሆነ በመስኖ አጠጣኝ ወይም ሽምብራ ዝራ።",
  englishSubtitles:
    "Hello! I am your soil. The sun has been baking hot and dry so my moisture is low; if you plant, please water me with irrigation or sow drought-hardy chickpeas.",
  strategies: [] as unknown as SoilVoiceResponse["strategies"],
  audioBase64: null,
  audioProvider: "none",
  verdict: "plant",
  reasons: [
    "Bare-soil erosion window opens next month; chickpea cover protects topsoil.",
    "Root-zone moisture is low from dry heat; irrigation or drought-hardy legume needed.",
  ],
  confidence: "medium",
  crop: "chickpea",
  intent: "plant_check",
};

interface DemoOverrides {
  state?: SoilUiState;
  mood?: SoilMood;
  why?: boolean;
  langSheet?: boolean;
  regionSheet?: boolean;
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
    langSheet: p.get("sheet") === "lang",
    regionSheet: p.get("sheet") === "region",
    onboarding: p.get("onboarding") === "1",
    nocamera: p.get("nocamera") === "1",
  };
}

interface UseSoilConversationArgs {
  fieldData: FusedFieldData | null;
  /** Active spoken language (Addis code). */
  language: AddisLanguageCode;
  getImage: () => string | null;
  /** Current farmer location for the soil-voice payload (null when unset). */
  getLocation?: () => Pick<FarmerLocation, "lat" | "lon" | "source"> | null;
}

export function useSoilConversation({
  fieldData,
  language,
  getImage,
  getLocation,
}: UseSoilConversationArgs) {
  const langStrings = SUPPORTED_LANGUAGES[language];
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const srResolvedRef = useRef<boolean>(false);
  const humRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const isListeningRef = useRef<boolean>(false);
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

  const getLocationRef = useRef(getLocation);
  useEffect(() => {
    getLocationRef.current = getLocation;
  }, [getLocation]);

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
      recognition.lang = langStrings.speechRecognitionLang;
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, [srSupported, langStrings]);

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
    micStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    micStreamRef.current = null;
    mediaRecorderRef.current = null;
    setMicLevels([0, 0, 0, 0, 0]);
  }, []);

  const startMicMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If the user already released or cancelled before stream resolved, discard immediately
      if (!isListeningRef.current) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        return;
      }
      micStreamRef.current = stream;

      // Start MediaRecorder for Addis Scribe / Gemini STT fallback
      if (typeof MediaRecorder !== "undefined") {
        audioChunksRef.current = [];
        let mimeType = "audio/webm";
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
        try {
          const recorder = new MediaRecorder(stream, { mimeType });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          mediaRecorderRef.current = recorder;
          recorder.start(100);
        } catch {
          mediaRecorderRef.current = null;
        }
      }

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
    async (question: string, explicitCrop?: string | null) => {
      const q = question.trim();
      if (!q) return;
      setLastQuestion(q);
      setCachedCaption(null);
      setUiState("thinking");
      startHum();

      try {
        const loc = getLocationRef.current?.() ?? null;
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
            ...(explicitCrop ? { crop: explicitCrop } : {}),
            ...(loc
              ? { lat: loc.lat, lon: loc.lon, locationSource: loc.source }
              : {}),
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
    srResolvedRef.current = false;
    isListeningRef.current = true;
    recordingStartRef.current = Date.now();
    setUiState("listening");
    startMicMeter();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = (event) => {
        srResolvedRef.current = true;
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
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    const elapsed = Date.now() - recordingStartRef.current;

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    // If browser SR already resolved a transcript, clean up and exit
    if (srResolvedRef.current) {
      stopMicMeter();
      return;
    }

    // If MediaRecorder was actively recording, flush and send to STT
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      const recorder = mediaRecorderRef.current;
      const mime = recorder.mimeType || "audio/webm";

      try {
        recorder.requestData();
      } catch {
        // ignore
      }

      recorder.onstop = async () => {
        stopMicMeter();
        if (srResolvedRef.current) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        // Minimum ~500ms of audio and at least 3000 bytes (WebM header alone is ~1.5-2KB)
        if (elapsed < 500 || audioBlob.size < 3000) {
          console.info(`[SoilVoice] Audio too brief (${elapsed}ms, ${audioBlob.size} bytes). Resetting to idle.`);
          setUiState("idle");
          return;
        }

        setUiState("thinking");
        startHum();

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "farmer_speech.webm");
          formData.append("language", language);

          const sttRes = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });

          if (sttRes.ok) {
            const sttData = await sttRes.json();
            if (sttData.text?.trim()) {
              await askQuestion(sttData.text.trim());
              return;
            }
          }
        } catch (err) {
          console.warn("STT transcription fallback failed:", err);
        } finally {
          stopHum();
        }

        if (!srResolvedRef.current) {
          setUiState("idle");
        }
      };

      try {
        recorder.stop();
      } catch {
        stopMicMeter();
        setUiState("idle");
      }
    } else {
      // Stream hasn't finished connecting or permission was denied
      stopMicMeter();
      if (!srResolvedRef.current) {
        setUiState("idle");
      }
    }
  }, [askQuestion, language, startHum, stopHum, stopMicMeter]);

  // ── Current caption text ──
  const effectiveState: SoilUiState =
    demo.state === "speaking" ? "speaking" : uiState;

  let captionAm = "";
  let captionEn = "";
  if (effectiveState === "listening") {
    captionAm = langStrings.listening;
    captionEn = SOIL_STRINGS.listening.en;
  } else if (effectiveState === "thinking") {
    captionAm = langStrings.thinking;
    captionEn = SOIL_STRINGS.thinking.en;
  } else if (uiState === "offline" && cachedCaption) {
    captionAm = cachedCaption;
    captionEn = SOIL_STRINGS.offlineBody.en;
  } else if (soilVoice?.firstPersonScript) {
    captionAm = soilVoice.firstPersonScript;
    captionEn = soilVoice.englishSubtitles;
  } else {
    captionAm = langStrings.greeting;
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

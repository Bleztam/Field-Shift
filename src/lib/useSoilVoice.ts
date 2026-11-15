"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { mapLanguageToCode } from "./languageCodes";

export interface SoilSpeakOptions {
  text: string;
  language?: string;
  audioBase64?: string | null;
}

export interface UseSoilVoiceReturn {
  speakSoil: (
    optionsOrText: SoilSpeakOptions | string,
    language?: string,
    audioBase64?: string
  ) => Promise<void>;
  stopSoil: () => void;
  isSpeaking: boolean;
  frequencyData: number[]; // 16 bars, values 0-255
}

const ZERO_BARS: number[] = new Array(16).fill(0);

const LAST_SOIL_AUDIO_KEY = "fieldshift:lastSoilAudio";
const MAX_CACHED_AUDIO_CHARS = 1_500_000; // stay well under localStorage quota

export interface CachedSoilAudio {
  audioBase64: string;
  text: string;
  language?: string;
  savedAt: number;
}

// Caches the most recent soil voice audio so the farmer can replay the last
// answer offline without re-billing TTS credits.
export function cacheLastSoilAudio(entry: Omit<CachedSoilAudio, "savedAt">): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (!entry.audioBase64 || entry.audioBase64.length > MAX_CACHED_AUDIO_CHARS) return;
    const payload: CachedSoilAudio = { ...entry, savedAt: Date.now() };
    window.localStorage.setItem(LAST_SOIL_AUDIO_KEY, JSON.stringify(payload));
  } catch {
    // Quota or privacy-mode failures are non-fatal.
  }
}

export function loadLastSoilAudio(): CachedSoilAudio | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LAST_SOIL_AUDIO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSoilAudio;
    if (!parsed?.audioBase64 || !parsed?.text) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useSoilVoice(): UseSoilVoiceReturn {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [frequencyData, setFrequencyData] = useState<number[]>(ZERO_BARS);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // Keep ref synchronized
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // ── Stop all playback and animations ──
  const stopSoil = useCallback(() => {
    // 1. Stop HTML5 audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // 2. Stop Capacitor native TTS if active
    if (typeof window !== "undefined") {
      const cap = (window as unknown as { Capacitor?: { Plugins?: { TextToSpeech?: { stop: () => Promise<void> } } } })
        .Capacitor;
      if (cap?.Plugins?.TextToSpeech?.stop) {
        cap.Plugins.TextToSpeech.stop().catch(() => {});
      }

      // 3. Stop browser Web Speech API
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    // 4. Cancel animation frame
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setIsSpeaking(false);
    setFrequencyData(ZERO_BARS);
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopSoil();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopSoil]);

  // ── Start Simulated Waveform Animation for Fallbacks ──
  const startSimulatedWaveform = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const animate = (time: number) => {
      if (!isSpeakingRef.current) {
        setFrequencyData(ZERO_BARS);
        return;
      }

      const bars: number[] = [];
      for (let i = 0; i < 16; i++) {
        // Organic multi-sine wave pattern mimicking spoken vocal formants
        const wave1 = Math.sin(time * 0.007 + i * 0.45);
        const wave2 = Math.cos(time * 0.003 - i * 0.25);
        const combined = Math.abs(wave1 * 0.7 + wave2 * 0.3);
        const val = Math.min(255, Math.floor(combined * 190 + Math.random() * 45 + 20));
        bars.push(val);
      }

      setFrequencyData(bars);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Main Speak Function (3-Tier) ──
  const speakSoil = useCallback(
    async (
      optionsOrText: SoilSpeakOptions | string,
      langParam?: string,
      audioParam?: string
    ) => {
      stopSoil();

      const options: SoilSpeakOptions =
        typeof optionsOrText === "string"
          ? { text: optionsOrText, language: langParam, audioBase64: audioParam }
          : optionsOrText;

      const { text, language = "English", audioBase64 } = options;
      if (!text && !audioBase64) return;

      if (audioBase64) {
        cacheLastSoilAudio({ audioBase64, text, language });
      }

      setIsSpeaking(true);
      isSpeakingRef.current = true;

      // ─────────────────────────────────────────────────────────────
      // TIER 1 (PRIMARY): High-Fidelity Audio Element + Web Audio Analyser
      // ─────────────────────────────────────────────────────────────
      if (audioBase64) {
        try {
          // Initialize Audio Element
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.crossOrigin = "anonymous";
          }
          const audio = audioRef.current;
          audio.src = audioBase64;

          // Initialize Web Audio Context and AnalyserNode
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            const AudioCtxClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            audioCtxRef.current = new AudioCtxClass();
          }
          const ctx = audioCtxRef.current;

          if (ctx.state === "suspended") {
            await ctx.resume().catch(() => {});
          }

          if (!analyserRef.current) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64; // 32 frequency bins
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;
          }
          const analyser = analyserRef.current;

          // Connect MediaElementSource once per audio element
          if (!sourceRef.current) {
            try {
              sourceRef.current = ctx.createMediaElementSource(audio);
              sourceRef.current.connect(analyser);
              analyser.connect(ctx.destination);
            } catch (connErr) {
              console.warn("MediaElementAudioSourceNode already connected:", connErr);
            }
          }

          // 60fps Frequency Data extraction loop
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const renderFrame = () => {
            if (!isSpeakingRef.current) {
              setFrequencyData(ZERO_BARS);
              return;
            }

            analyser.getByteFrequencyData(dataArray);

            // Downsample 32 bins to 16 bars
            const bars: number[] = [];
            for (let i = 0; i < 16; i++) {
              const binIdx = Math.min(bufferLength - 1, Math.floor(i * (bufferLength / 16)));
              bars.push(dataArray[binIdx]);
            }

            setFrequencyData(bars);
            animFrameRef.current = requestAnimationFrame(renderFrame);
          };

          audio.onended = () => {
            stopSoil();
          };

          audio.onerror = () => {
            console.warn("Audio element playback error, falling back to Tier 2/3");
            playFallbackSpeech(text, language);
          };

          animFrameRef.current = requestAnimationFrame(renderFrame);
          await audio.play();
          return;
        } catch (tier1Err) {
          console.warn("Tier 1 audio playback failed, falling back to Tier 2/3:", tier1Err);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // TIER 2 & TIER 3: Fallbacks
      // ─────────────────────────────────────────────────────────────
      playFallbackSpeech(text, language);
    },
    [stopSoil, startSimulatedWaveform]
  );

  // ── Fallback runner: Tier 2 (Capacitor) -> Tier 3 (Web Speech) ──
  const playFallbackSpeech = useCallback(
    async (text: string, language: string) => {
      const langCode = mapLanguageToCode(language);
      startSimulatedWaveform();

      // Tier 2: Capacitor Native APK TTS Plugin
      if (typeof window !== "undefined") {
        const cap = (window as unknown as {
          Capacitor?: {
            Plugins?: {
              TextToSpeech?: {
                speak: (opts: { text: string; lang: string; rate?: number; pitch?: number }) => Promise<void>;
              };
            };
          };
        }).Capacitor;

        if (cap?.Plugins?.TextToSpeech?.speak) {
          try {
            await cap.Plugins.TextToSpeech.speak({
              text,
              lang: langCode,
              rate: 0.9,
              pitch: 0.75,
            });
            stopSoil();
            return;
          } catch (capErr) {
            console.warn("Capacitor TextToSpeech failed, attempting Tier 3:", capErr);
          }
        }

        // Tier 3: Browser window.speechSynthesis (e.g. am-ET voice when the
        // platform ships one; otherwise the browser default, typically en).
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = langCode;
          utterance.rate = 0.88;
          utterance.pitch = 0.72;

          const langPrefix = langCode.split("-")[0]?.toLowerCase();
          const matchingVoice = window.speechSynthesis
            .getVoices()
            .find((v) => v.lang?.toLowerCase().startsWith(langPrefix));
          if (matchingVoice) {
            utterance.voice = matchingVoice;
          }

          utterance.onend = () => {
            stopSoil();
          };

          utterance.onerror = () => {
            stopSoil();
          };

          window.speechSynthesis.speak(utterance);
          return;
        }
      }

      // If no speech synthesis engine exists, run a 4-second animation then stop
      setTimeout(() => {
        stopSoil();
      }, 4000);
    },
    [startSimulatedWaveform, stopSoil]
  );

  return {
    speakSoil,
    stopSoil,
    isSpeaking,
    frequencyData,
  };
}

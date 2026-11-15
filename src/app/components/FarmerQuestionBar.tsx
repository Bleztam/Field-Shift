"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Send, MessageSquare, Sparkles, Loader2, X } from "lucide-react";
import { Language, SoilMood } from "@/lib/types";
import { mapLanguageToCode } from "@/lib/languageCodes";

interface FarmerQuestionBarProps {
  onAskQuestion: (question: string) => void;
  isLoading: boolean;
  currentMood?: SoilMood;
  lastQuestion?: string;
  language?: Language;
}

const QUICK_QUESTIONS = [
  "Why are you cracking?",
  "What can I plant that still makes cash?",
  "Will chickpeas survive the dry months?",
  "How much moisture is left in your root zone?",
];

export default function FarmerQuestionBar({
  onAskQuestion,
  isLoading,
  currentMood = "stressed",
  lastQuestion,
  language = "English",
}: FarmerQuestionBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported. The mic button gracefully
  // falls back to the plain text input + quick-question chips when the
  // browser lacks SpeechRecognition (or the am-ET locale) — never crash.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = mapLanguageToCode(language); // e.g. am-ET for Amharic

          recognition.onresult = (event: any) => {
            const transcript = event.results[0]?.[0]?.transcript;
            if (transcript) {
              setInputText(transcript);
              onAskQuestion(transcript);
              setIsOpen(false);
            }
            setIsListening(false);
          };

          recognition.onerror = () => {
            setIsListening(false);
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore abort races on teardown
        }
      }
    };
  }, [onAskQuestion, language]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      // Fallback: open text box if speech recognition not supported
      setIsOpen(true);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setIsListening(true);
        setIsOpen(true);
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    onAskQuestion(inputText.trim());
    setInputText("");
    setIsOpen(false);
  };

  const handleChipClick = (q: string) => {
    if (isLoading) return;
    setInputText(q);
    onAskQuestion(q);
    setIsOpen(false);
  };

  return (
    <div className="z-25 mx-3 mb-1">
      {/* Floating Toggle Bar when closed */}
      {!isOpen ? (
        <div className="flex items-center justify-between gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 text-xs text-amber-200/90 hover:text-white transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-medium truncate max-w-[210px]">
              {lastQuestion ? `"${lastQuestion}"` : "Talk to the Soil (Ask questions)"}
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMic}
              className={`p-1.5 rounded-full transition-all ${
                isListening
                  ? "bg-red-500 text-white animate-ping"
                  : "bg-white/10 text-white/80 hover:bg-amber-600 hover:text-white"
              }`}
              title="Voice Question"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="text-[11px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 hover:bg-amber-500/30"
            >
              Ask
            </button>
          </div>
        </div>
      ) : (
        /* Expanded Question Tray */
        <div className="bg-black/90 backdrop-blur-2xl rounded-2xl p-3 border border-amber-500/40 shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Ask the Living Soil Directly
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick-Question Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(q)}
                disabled={isLoading}
                className="shrink-0 text-[11px] bg-white/5 hover:bg-amber-600/30 text-white/80 hover:text-amber-200 border border-white/10 hover:border-amber-400/50 px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Text Input + Mic + Send */}
          <div className="flex items-center gap-1.5 bg-black/60 rounded-xl px-2.5 py-1.5 border border-white/15 focus-within:border-amber-400/70">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={isListening ? "Listening to your voice..." : "Type question to the soil..."}
              className="flex-1 bg-transparent text-xs text-white placeholder-white/40 focus:outline-none"
              disabled={isLoading}
            />

            <button
              onClick={toggleMic}
              className={`p-1.5 rounded-lg transition-colors ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "text-white/60 hover:text-amber-400"
              }`}
              title="Speak with microphone"
            >
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleSend}
              disabled={isLoading || !inputText.trim()}
              className="p-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 transition-colors"
              title="Send question"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

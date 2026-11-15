// ─── /api/tts — Amharic: Addis AI first, Gemini TTS fallback, else browser ───
// Request shape unchanged:  { text, voice?, language? }
// Response shape unchanged: { audioBase64, ... } (audioBase64 is null when
// the client should fall back to speechSynthesis — am-ET, then en).
import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeechWithGemini } from "@/lib/audioBuffer";
import { synthesizeAmharic } from "@/lib/addisTts";
import { looksLikeAmharic } from "@/lib/languageCodes";
import { AudioProvider } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = "Fenrir", language } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text string is required" },
        { status: 400 }
      );
    }

    const wantsAmharic = language === "Amharic" || looksLikeAmharic(text);

    if (wantsAmharic) {
      const addis = await synthesizeAmharic(text);
      if (addis) {
        return NextResponse.json({
          audioBase64: `data:audio/mpeg;base64,${addis.audioBase64}`,
          audioProvider: "addis" satisfies AudioProvider,
        });
      }
    }

    const audioBase64 = await synthesizeSpeechWithGemini(text, voice);
    if (audioBase64) {
      return NextResponse.json({
        audioBase64,
        audioProvider: "gemini" satisfies AudioProvider,
      });
    }

    return NextResponse.json({
      audioBase64: null,
      audioProvider: "browser" satisfies AudioProvider,
    });
  } catch (err: unknown) {
    console.error("TTS endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

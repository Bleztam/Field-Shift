// ─── /api/tts — supported languages via Addis AI, Gemini fallback, else browser ───
// Request:  { text, voice?, language? }   (language: Addis code am/om/ti/sid/wal,
//           or legacy "Amharic"/"Afaan Oromo"/"English"/"Spanish")
// Response: { audioBase64, audioProvider } (audioBase64 null → client speaks
//           via speechSynthesis in the active language, then en).
import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeechWithGemini } from "@/lib/audioBuffer";
import { synthesizeAddis } from "@/lib/addisTts";
import { resolveVoiceForLanguage } from "@/lib/addisVoices";
import { isAddisLanguageCode } from "@/lib/languageConfig";
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

    // Normalize legacy display names to Addis codes.
    const addisCode = isAddisLanguageCode(language)
      ? language
      : language === "Amharic"
        ? "am"
        : language === "Afaan Oromo"
          ? "om"
          : looksLikeAmharic(text)
            ? "am"
            : null;

    if (addisCode) {
      const voiceId = await resolveVoiceForLanguage(addisCode);
      if (voiceId) {
        const addis = await synthesizeAddis(text, {
          language: addisCode,
          voiceId,
        });
        if (addis) {
          return NextResponse.json({
            audioBase64: `data:audio/mpeg;base64,${addis.audioBase64}`,
            audioProvider: "addis" satisfies AudioProvider,
            language: addisCode,
          });
        }
      }
      // No voice or synthesis failed → fall through to Gemini/browser.
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

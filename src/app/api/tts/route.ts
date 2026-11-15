// ─── /api/tts — Dedicated Gemini Flash TTS Endpoint ───
import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeechWithGemini } from "@/lib/audioBuffer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = "Fenrir" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text string is required" },
        { status: 400 }
      );
    }

    const audioBase64 = await synthesizeSpeechWithGemini(text, voice);

    if (!audioBase64) {
      return NextResponse.json(
        { error: "TTS synthesis unavailable", audioBase64: null },
        { status: 503 }
      );
    }

    return NextResponse.json({ audioBase64 });
  } catch (err: unknown) {
    console.error("TTS endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

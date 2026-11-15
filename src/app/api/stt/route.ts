// ─── /api/stt — Speech-to-Text Endpoint (Addis Scribe + Gemini Multimodal STT) ───
import { NextRequest, NextResponse } from "next/server";
import { transcribeAddisScribe } from "@/lib/addisTts";

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  language: string
): Promise<{ text: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !audioBuffer || audioBuffer.length < 2500) return null;

  const base64Data = audioBuffer.toString("base64");
  const normalizedMime = mimeType.split(";")[0].trim() || "audio/webm";

  const prompt = `You are a speech-to-text audio transcriber. Listen carefully to this audio recording of a farmer speaking in ${language}. Transcribe what they say verbatim. Return ONLY the transcribed text in ${language}, with no explanations, no quotes, and no timestamps.`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(3500),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: normalizedMime, data: base64Data } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (rawText) {
        return { text: rawText.replace(/^["']|["']$/g, "").trim() };
      }
    } catch {
      // try next model or timeout
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let audioBuffer: Buffer | null = null;
    let mimeType = "audio/webm";
    let language = "am";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("audio") || formData.get("file");
      language = (formData.get("language") as string) || "am";

      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const ab = await file.arrayBuffer();
        audioBuffer = Buffer.from(ab);
        mimeType = file.type || "audio/webm";
      }
    } else {
      const json = await req.json();
      language = json.language || "am";
      mimeType = json.mimeType || "audio/webm";

      if (json.audioBase64) {
        const cleanBase64 = json.audioBase64.replace(/^data:audio\/\w+;base64,/, "");
        audioBuffer = Buffer.from(cleanBase64, "base64");
      }
    }

    if (!audioBuffer || audioBuffer.length < 2500) {
      return NextResponse.json(
        { error: "Audio snippet too short to transcribe (minimum ~0.5s of speech required)" },
        { status: 400 }
      );
    }

    const langLower = language.toLowerCase();
    const isAfricanLang =
      ["am", "om", "ti", "sid", "wal", "sw"].includes(langLower) ||
      langLower.includes("amharic") ||
      langLower.includes("oromo") ||
      langLower.includes("tigrinya") ||
      langLower.includes("sidama") ||
      langLower.includes("wolaytta") ||
      langLower.includes("swahili");

    let addisCode = "am";
    if (langLower.includes("oromo") || langLower === "om") addisCode = "om";
    else if (langLower.includes("tigrinya") || langLower === "ti") addisCode = "ti";
    else if (langLower.includes("sidama") || langLower === "sid") addisCode = "sid";
    else if (langLower.includes("wolaytta") || langLower === "wal") addisCode = "wal";
    else if (langLower.includes("swahili") || langLower === "sw") addisCode = "sw";

    if (isAfricanLang) {
      // 1. Primary for Ethiopian / African languages: Addis Scribe
      const addisRes = await transcribeAddisScribe(audioBuffer, addisCode, mimeType);
      if (addisRes?.text) {
        return NextResponse.json({
          text: addisRes.text,
          language: addisCode,
          provider: "addis-scribe",
          seconds: addisRes.seconds,
        });
      }

      // 2. Fallback to Gemini STT
      const geminiRes = await transcribeWithGemini(audioBuffer, mimeType, language);
      if (geminiRes?.text) {
        return NextResponse.json({
          text: geminiRes.text,
          language,
          provider: "gemini",
        });
      }
    } else {
      // 1. Primary for English & Spanish: Gemini Multimodal STT
      const geminiRes = await transcribeWithGemini(audioBuffer, mimeType, language);
      if (geminiRes?.text) {
        return NextResponse.json({
          text: geminiRes.text,
          language,
          provider: "gemini",
        });
      }

      // 2. Fallback to Addis Scribe for English
      if (langLower.includes("en")) {
        const addisRes = await transcribeAddisScribe(audioBuffer, "en", mimeType);
        if (addisRes?.text) {
          return NextResponse.json({
            text: addisRes.text,
            language: "en",
            provider: "addis-scribe",
            seconds: addisRes.seconds,
          });
        }
      }
    }

    return NextResponse.json(
      { error: "Could not transcribe audio", text: "" },
      { status: 422 }
    );
  } catch (err: unknown) {
    console.error("STT route error:", err);
    return NextResponse.json(
      { error: "Internal server error during speech recognition" },
      { status: 500 }
    );
  }
}

// ─── RIFF / WAV Audio Buffer Helpers for APK-Safe Audio ───

/**
 * Ensures audio buffer has a standard 44-byte RIFF/WAV header.
 * If raw 24kHz 16-bit mono PCM is supplied without a header, wraps it cleanly.
 */
export function ensureWavBuffer(base64Data: string): string {
  const buf = Buffer.from(base64Data, "base64");

  // Check if buffer already starts with "RIFF" and has "WAVE" format
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  ) {
    return `data:audio/wav;base64,${base64Data}`;
  }

  // Wrap raw 24kHz 16-bit mono PCM into a standard WAV container
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = buf.length;
  const buffer = Buffer.alloc(44 + dataLength);

  // 1. RIFF chunk descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);

  // 2. fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // 3. data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  buf.copy(buffer, 44);

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

/**
 * Synthesizes speech using the Gemini TTS model (gemini-3.8-flash-tts).
 * Falls back gracefully if unavailable.
 */
export async function synthesizeSpeechWithGemini(
  text: string,
  voiceName = "Fenrir"
): Promise<string | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return undefined;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${apiKey}`;

  // Limit text slice for optimal latency
  const textPrompt = text.slice(0, 600);

  const payload = {
    contents: [{ parts: [{ text: textPrompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn("Gemini TTS synthesis HTTP status:", res.status);
      return undefined;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    for (const part of parts) {
      if (part.inlineData?.data) {
        return ensureWavBuffer(part.inlineData.data);
      }
    }
  } catch (err) {
    console.warn("Gemini TTS synthesis call failed:", err);
  }

  return undefined;
}

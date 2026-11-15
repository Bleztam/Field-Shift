// ─── /api/tts/health — Admin probe for the Addis AI TTS integration ───
// Returns per-language { configured, reachable, voiceCount } only.
// Never exposes the key or upstream payload details.
import { NextRequest, NextResponse } from "next/server";
import { getAddisLanguageHealth } from "@/lib/addisVoices";

export async function GET(req: NextRequest) {
  // Reading the incoming request opts this route out of static prerendering
  // (same mechanism as /api/nasa-power), so health always reflects runtime.
  void req.headers.get("user-agent");
  const languages = await getAddisLanguageHealth();
  return NextResponse.json(languages);
}

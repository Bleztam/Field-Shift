// ─── /api/tts/health — Admin probe for the Addis AI TTS integration ───
// Returns ONLY { configured, reachable }. Never exposes the key or upstream
// payload details.
import { NextRequest, NextResponse } from "next/server";
import { checkAddisHealth } from "@/lib/addisTts";

export async function GET(req: NextRequest) {
  // Reading the incoming request opts this route out of static prerendering
  // (same mechanism as /api/nasa-power), so health always reflects runtime.
  void req.headers.get("user-agent");
  const health = await checkAddisHealth();
  return NextResponse.json({
    configured: health.configured,
    reachable: health.reachable,
  });
}

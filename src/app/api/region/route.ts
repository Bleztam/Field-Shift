// ─── /api/region — reverse-geocode lat/lon → Ethiopian region ───
// GET /api/region?lat=..&lon=..
// → { regionName, regionKey, source: "nominatim"|"fallback", confidence }
// Never throws; unknown points return regionKey "unknown" with low confidence.
import { NextRequest, NextResponse } from "next/server";
import { reverseGeocodeRegion } from "@/lib/region";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      {
        regionName: null,
        regionKey: "unknown",
        source: "fallback",
        confidence: "low",
      },
      { status: 400 }
    );
  }

  const result = await reverseGeocodeRegion(lat, lon);
  return NextResponse.json(result);
}

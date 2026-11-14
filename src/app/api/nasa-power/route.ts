// ─── /api/nasa-power — Fetch live NASA POWER + fuse with satellite presets ───
import { NextRequest, NextResponse } from "next/server";
import { PRESETS, getPresetById } from "@/lib/presets";
import { NasaPowerDaily, FusedFieldData, SatellitePreset } from "@/lib/types";

const NASA_POWER_BASE =
  "https://power.larc.nasa.gov/api/temporal/daily/point";

const PARAMS = "T2M,T2M_MAX,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function nDaysAgoStr(n: number) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const presetId = searchParams.get("preset");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");

    let useLat: number;
    let useLon: number;
    let preset = presetId ? getPresetById(presetId) : undefined;

    if (preset) {
      useLat = preset.lat;
      useLon = preset.lon;
    } else if (lat && lon) {
      useLat = parseFloat(lat);
      useLon = parseFloat(lon);
      preset =
        PRESETS.find(
          (p) => Math.hypot(p.lat - useLat, p.lon - useLon) < 10
        ) ?? PRESETS[0];
    } else {
      preset = PRESETS[0];
      useLat = preset.lat;
      useLon = preset.lon;
    }

    // Fetch window from NASA POWER: 18 days ago up to 1 day ago
    const start = nDaysAgoStr(18);
    const end = nDaysAgoStr(1);

    const url = `${NASA_POWER_BASE}?parameters=${PARAMS}&community=AG&format=JSON&latitude=${useLat}&longitude=${useLon}&start=${start}&end=${end}`;

    const nasaRes = await fetch(url, {
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (!nasaRes.ok) {
      console.warn("NASA POWER fetch failed, using fallback preset data");
      return NextResponse.json(createFallback(preset));
    }

    const data = await nasaRes.json();
    const params = data.properties?.parameter ?? {};
    const dates = Object.keys(params.T2M ?? {}).sort();

    // Climatology seed values in case the very earliest days have fill values
    let lastValidT2M = 20.0;
    let lastValidT2MMax = 27.0;
    let lastValidPrecip = 0.0;
    let lastValidSolar = 18.0;
    let lastValidRH = 50.0;

    const dailyRecords: NasaPowerDaily[] = [];

    for (const d of dates) {
      const rawT2M = params.T2M?.[d];
      const rawT2MMax = params.T2M_MAX?.[d];
      const rawPrecip = params.PRECTOTCORR?.[d];
      const rawSolar = params.ALLSKY_SFC_SW_DWN?.[d];
      const rawRH = params.RH2M?.[d];

      // If temperature is missing/unprocessed (-999), this date is beyond NASA's processed window
      if (rawT2M == null || rawT2M < -900) continue;

      if (rawT2M > -900) lastValidT2M = rawT2M;
      if (rawT2MMax != null && rawT2MMax > -900) lastValidT2MMax = rawT2MMax;
      if (rawPrecip != null && rawPrecip > -900) lastValidPrecip = rawPrecip;
      if (rawSolar != null && rawSolar > -900) lastValidSolar = rawSolar;
      if (rawRH != null && rawRH > -900) lastValidRH = rawRH;

      dailyRecords.push({
        date: d,
        T2M: rawT2M > -900 ? rawT2M : lastValidT2M,
        T2M_MAX:
          rawT2MMax != null && rawT2MMax > -900 ? rawT2MMax : lastValidT2MMax,
        PRECTOTCORR:
          rawPrecip != null && rawPrecip > -900 ? rawPrecip : lastValidPrecip,
        ALLSKY_SFC_SW_DWN:
          rawSolar != null && rawSolar > -900 ? rawSolar : lastValidSolar,
        RH2M: rawRH != null && rawRH > -900 ? rawRH : lastValidRH,
      });
    }

    const latest =
      dailyRecords.length > 0
        ? dailyRecords[dailyRecords.length - 1]
        : {
            T2M: lastValidT2M,
            T2M_MAX: lastValidT2MMax,
            PRECTOTCORR: lastValidPrecip,
            ALLSKY_SFC_SW_DWN: lastValidSolar,
            RH2M: lastValidRH,
            date: todayStr(),
          };

    const result: FusedFieldData = {
      preset: preset ?? PRESETS[0],
      nasaPower: dailyRecords,
      latestPower: latest,
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("NASA POWER API route error:", err);
    return NextResponse.json(createFallback(PRESETS[0]));
  }
}

function createFallback(preset?: SatellitePreset): FusedFieldData {
  return {
    preset: preset ?? PRESETS[0],
    nasaPower: [],
    latestPower: {
      T2M: 21.8,
      T2M_MAX: 28.4,
      PRECTOTCORR: 1.2,
      ALLSKY_SFC_SW_DWN: 19.5,
      RH2M: 52.0,
      date: todayStr(),
    },
  };
}

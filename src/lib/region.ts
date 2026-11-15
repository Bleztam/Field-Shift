// ─── Region resolution (server-only) ───
// Nominatim reverse geocode with a coarse Ethiopia bounding-box fallback.
// Honest confidence: "medium" when Nominatim answered, "low" for the coarse
// bbox — never presented as precise.
import { RegionKey } from "./languageConfig";

export interface RegionResult {
  regionName: string | null;
  regionKey: RegionKey;
  source: "nominatim" | "fallback";
  confidence: "medium" | "low";
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const CACHE_MAX = 200;
const MIN_INTERVAL_MS = 1_000; // Nominatim usage policy: max 1 req/s

interface CacheEntry {
  at: number;
  result: RegionResult;
}
const regionCache = new Map<string, CacheEntry>();

// Serialize upstream calls so we never exceed 1 req/s.
let lastUpstreamCall = 0;
let upstreamChain: Promise<void> = Promise.resolve();

function scheduleUpstreamSlot(): Promise<void> {
  const run = async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastUpstreamCall));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastUpstreamCall = Date.now();
  };
  upstreamChain = upstreamChain.then(run, run);
  return upstreamChain;
}

function cacheKey(lat: number, lon: number): string {
  // Round to 2 decimals (~1 km) — one cache entry per village-scale area.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Map a Nominatim address block to a region key. Names arrive in English or
 * local forms; match generously, never claim precision.
 */
export function mapNominatimAddress(address: Record<string, unknown>): {
  regionKey: RegionKey;
  regionName: string | null;
} {
  const state = String(
    address?.state ?? address?.region ?? address?.county ?? ""
  ).toLowerCase();
  const city = String(address?.city ?? address?.town ?? "").toLowerCase();
  const hay = `${state} ${city}`;

  let regionKey: RegionKey = "unknown";
  if (hay.includes("addis ababa") || hay.includes("addis abeba")) regionKey = "addis_ababa";
  else if (hay.includes("tigray") || hay.includes("tigrai")) regionKey = "tigray";
  else if (hay.includes("sidama")) regionKey = "sidama";
  else if (hay.includes("amhara")) regionKey = "amhara";
  else if (hay.includes("oromia")) regionKey = "oromia";
  else if (
    hay.includes("southern nations") ||
    hay.includes("snnpr") ||
    hay.includes("central ethiopia") ||
    hay.includes("south ethiopia") ||
    hay.includes("south west ethiopia") ||
    hay.includes("wolaita") ||
    hay.includes("wolayta")
  )
    regionKey = "snnpr";
  else if (state) regionKey = "other";

  const regionName =
    (typeof address?.state === "string" && address.state) ||
    (typeof address?.county === "string" && address.county) ||
    null;
  return { regionKey, regionName };
}

/**
 * Coarse bounding-box fallback for Ethiopia's main regions.
 * TODO verify: boxes are approximate; interleaved boundaries (esp. Oromia /
 * South Ethiopia) cannot be separated at this granularity. Small boxes are
 * checked first. Confidence is always "low".
 */
export function coarseRegionFor(lat: number, lon: number): RegionResult {
  const inBox = (la1: number, la2: number, lo1: number, lo2: number) =>
    lat >= la1 && lat <= la2 && lon >= lo1 && lon <= lo2;

  let regionKey: RegionKey = "unknown";
  let regionName: string | null = null;

  if (inBox(8.9, 9.15, 38.6, 38.95)) {
    regionKey = "addis_ababa";
    regionName = "Addis Ababa (approximate)";
  } else if (inBox(12.2, 14.9, 36.4, 39.9)) {
    regionKey = "tigray";
    regionName = "Tigray (approximate)";
  } else if (inBox(8.8, 13.9, 35.4, 40.4)) {
    regionKey = "amhara";
    regionName = "Amhara (approximate)";
  } else if (inBox(6.4, 7.3, 38.0, 38.9)) {
    regionKey = "sidama";
    regionName = "Sidama (approximate)";
  } else if (inBox(5.4, 7.6, 35.0, 38.3)) {
    regionKey = "snnpr";
    regionName = "South / Central Ethiopia (approximate)";
  } else if (inBox(3.4, 10.0, 34.9, 41.5)) {
    // Core Oromia extent; fringes (Dire Dawa, Gambella-edge, far west/east)
    // intentionally fall through to "other" at this coarse granularity.
    regionKey = "oromia";
    regionName = "Oromia (approximate)";
  } else if (inBox(3.0, 15.0, 32.9, 48.0)) {
    regionKey = "other";
    regionName = "Ethiopia (approximate)";
  }

  return { regionName, regionKey, source: "fallback", confidence: "low" };
}

interface NominatimResponse {
  address?: Record<string, unknown>;
}

/**
 * Reverse-geocode a point to a region. Nominatim first (cached 6 h at
 * 2-decimal coords, ≤1 req/s, 6 s timeout); any failure falls back to the
 * coarse bbox. Never throws.
 */
export async function reverseGeocodeRegion(
  lat: number,
  lon: number
): Promise<RegionResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { regionName: null, regionKey: "unknown", source: "fallback", confidence: "low" };
  }

  const key = cacheKey(lat, lon);
  const cached = regionCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  let result: RegionResult | null = null;
  try {
    await scheduleUpstreamSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=8&accept-language=en`,
        {
          signal: controller.signal,
          headers: {
            // Nominatim policy requires an identifying User-Agent.
            "User-Agent": "FieldShift/1.0 (NASA Space Apps demo; local development)",
            Accept: "application/json",
          },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as NominatimResponse;
        if (data.address) {
          const mapped = mapNominatimAddress(data.address);
          result = {
            regionName: mapped.regionName,
            regionKey: mapped.regionKey,
            source: "nominatim",
            confidence: "medium",
          };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    result = null;
  }

  if (!result || result.regionKey === "unknown") {
    const coarse = coarseRegionFor(lat, lon);
    result = coarse.regionKey === "unknown" && result ? result : coarse;
  }

  if (regionCache.size >= CACHE_MAX) {
    const oldest = regionCache.keys().next().value;
    if (oldest !== undefined) regionCache.delete(oldest);
  }
  regionCache.set(key, { at: Date.now(), result });
  return result;
}

/** Test-only hook. */
export function __clearRegionCacheForTests(): void {
  regionCache.clear();
  lastUpstreamCall = 0;
}

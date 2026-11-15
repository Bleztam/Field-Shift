// ─── Addis AI voice discovery (server-only) ───
// GET /api/v1/voice/voices?language=<code> per supported language, cached in
// memory for 6 h. Voice selection: ADDIS_VOICE_ID_<CODE> env override wins;
// otherwise the first voice the API returns. No voice IDs are hardcoded —
// except the original Amharic default kept for backward compatibility.
import { AddisLanguageCode, ADDIS_LANGUAGE_CODES } from "./languageConfig";

const ADDIS_BASE_URL = "https://api.addisassistant.com";
const VOICES_PATH = "/api/v1/voice/voices";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

/** Only Amharic keeps a hardcoded fallback voice (pre-existing behavior). */
export const DEFAULT_VOICE_ID_AM = "am-hamen";

interface VoiceCacheEntry {
  at: number;
  voiceIds: string[];
  /** True when the upstream listing call answered (even with an empty list). */
  reachable: boolean;
}
const voiceCache = new Map<AddisLanguageCode, VoiceCacheEntry>();

function envVoiceOverride(code: AddisLanguageCode): string | null {
  const v = process.env[`ADDIS_VOICE_ID_${code.toUpperCase()}`];
  return v && v.trim() ? v.trim() : null;
}

/** Defensive parse: accept id / voice_id / name fields on voice objects. */
function extractVoiceIds(payload: unknown): string[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { voices?: unknown[] })?.voices)
        ? (payload as { voices: unknown[] }).voices
        : [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) ids.push(item.trim());
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const id = o.id ?? o.voice_id ?? o.name;
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }
  return ids;
}

/**
 * Fetch the voice list for a language (non-billable). Returns [] on any
 * failure. Results are cached for 6 h per language.
 */
export async function getVoicesForLanguage(
  code: AddisLanguageCode
): Promise<string[]> {
  const apiKey = process.env.ADDIS_API_KEY;
  if (!apiKey) return [];

  const cached = voiceCache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.voiceIds;

  let voiceIds: string[] = [];
  let reachable = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADDIS_BASE_URL}${VOICES_PATH}?language=${code}`, {
      method: "GET",
      signal: controller.signal,
      headers: { "x-api-key": apiKey },
    });
    reachable = res.ok;
    if (res.ok) {
      voiceIds = extractVoiceIds(await res.json());
    }
  } catch {
    voiceIds = [];
  } finally {
    clearTimeout(timer);
  }

  voiceCache.set(code, { at: Date.now(), voiceIds, reachable });
  return voiceIds;
}

/**
 * Voice for a language: env override (ADDIS_VOICE_ID_AM/OM/TI/SID/WAL) wins;
 * otherwise the first voice returned by the API; Amharic falls back to the
 * historical default; anything else returns null (caller degrades to
 * browser/no audio — never crashes).
 */
export async function resolveVoiceForLanguage(
  code: AddisLanguageCode
): Promise<string | null> {
  const override = envVoiceOverride(code);
  if (override) return override;

  const voices = await getVoicesForLanguage(code);
  if (voices.length > 0) return voices[0];

  if (code === "am") {
    // Preserve the pre-existing default chain: legacy ADDIS_VOICE_ID, then
    // the historical am-hamen default.
    return process.env.ADDIS_VOICE_ID?.trim() || DEFAULT_VOICE_ID_AM;
  }
  return null;
}

export interface AddisLanguageHealth {
  configured: boolean;
  reachable: boolean;
  voiceCount: number;
}

/**
 * Per-language health for /api/tts/health. Uses the non-billable voices
 * listing; a language is "reachable" when that listing call succeeded.
 */
export async function getAddisLanguageHealth(): Promise<
  Record<AddisLanguageCode, AddisLanguageHealth>
> {
  const configured = Boolean(process.env.ADDIS_API_KEY);
  const entries = await Promise.all(
    ADDIS_LANGUAGE_CODES.map(async (code) => {
      if (!configured) {
        return [
          code,
          { configured: false, reachable: false, voiceCount: 0 },
        ] as const;
      }
      const voiceIds = await getVoicesForLanguage(code);
      const reachable = voiceCache.get(code)?.reachable ?? false;
      return [
        code,
        { configured: true, reachable, voiceCount: voiceIds.length },
      ] as const;
    })
  );
  return Object.fromEntries(entries) as Record<
    AddisLanguageCode,
    AddisLanguageHealth
  >;
}

/** Test-only hook. */
export function __clearAddisVoiceCacheForTests(): void {
  voiceCache.clear();
}

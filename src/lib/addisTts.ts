// ─── Addis AI Amharic TTS Client (server-only) ───
// Verified API surface only: https://api.addisassistant.com
//   POST /api/v1/voice/generations (x-api-key auth)
//   GET  /api/v1/voice/voices?language=am
// Billing is per minute of generated audio: cache aggressively, cap text,
// and retry at most once with the same idempotency key.
import { createHash } from "crypto";
import { AddisLanguageCode } from "./languageConfig";
import { DEFAULT_VOICE_ID_AM } from "./addisVoices";

const ADDIS_BASE_URL = "https://api.addisassistant.com";
const GENERATIONS_PATH = "/api/v1/voice/generations";
const VOICES_PATH = "/api/v1/voice/voices";
const DEFAULT_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;
const HEALTH_CACHE_TTL_MS = 60_000;
const MAX_TEXT_CHARS = 400;
const MAX_SENTENCES = 3;
const CACHE_MAX_ENTRIES = 50;

export interface AddisTtsResult {
  /** Raw base64 audio (data-URI prefix stripped). */
  audioBase64: string;
  provider: "addis";
}

interface AddisGenerationBody {
  data?: {
    audio?: string;
    audio_url?: string;
    duration_seconds?: number;
    billable_characters?: number;
  };
  billable_characters?: number;
  usage?: {
    credits_remaining?: number;
  };
}

// In-memory cache keyed by sha256(voiceId + text) so repeated questions
// never re-bill. FIFO-trimmed; per-process only.
const audioCache = new Map<string, AddisTtsResult>();

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Deterministic UUID-shaped idempotency key derived from the request content,
// so the single allowed retry replays the exact same generation request.
function deterministicRequestId(hashHex: string): string {
  return [
    hashHex.slice(0, 8),
    hashHex.slice(8, 12),
    hashHex.slice(12, 16),
    hashHex.slice(16, 20),
    hashHex.slice(20, 32),
  ].join("-");
}

// Cap cost: keep at most the first 3 sentences and 400 characters.
// Includes the Ge'ez sentence mark "።" alongside Latin terminators.
export function capTextForTts(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const sentences = trimmed.match(/[^.!?።\n]+[.!?።]*/gu) ?? [trimmed];
  const firstSentences = sentences
    .slice(0, MAX_SENTENCES)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return firstSentences.slice(0, MAX_TEXT_CHARS);
}

function stripDataUriPrefix(audio: string): string {
  return audio.replace(/^data:audio\/[^;]+;base64,/i, "");
}

interface AttemptOutcome {
  ok: boolean;
  retryable: boolean;
  status?: number;
  reason?: string;
  body?: AddisGenerationBody;
}

async function postGeneration(
  apiKey: string,
  voiceId: string,
  language: AddisLanguageCode,
  text: string,
  clientRequestId: string,
  timeoutMs: number
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ADDIS_BASE_URL}${GENERATIONS_PATH}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        client_request_id: clientRequestId,
        voice_id: voiceId,
        language,
        text,
        output_format: "mp3_44100",
      }),
    });

    if (!res.ok) {
      let shortReason = res.statusText || "request failed";
      try {
        const errBody = (await res.json()) as { message?: string; error?: string };
        shortReason = (errBody.message ?? errBody.error ?? shortReason)
          .toString()
          .slice(0, 120);
      } catch {
        // keep statusText reason
      }
      return {
        ok: false,
        retryable: res.status >= 500,
        status: res.status,
        reason: shortReason,
      };
    }

    const body = (await res.json()) as AddisGenerationBody;
    return { ok: true, retryable: false, status: res.status, body };
  } catch (err) {
    // Node's fetch throws a DOMException (not an Error) on abort — match by name.
    const errName = (err as { name?: string } | null)?.name;
    const reason =
      errName === "AbortError" || errName === "TimeoutError"
        ? `timeout after ${timeoutMs}ms`
        : `network error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 120);
    return { ok: false, retryable: true, reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Synthesizes speech via Addis AI for any supported language. Returns null on
 * any failure — never throws, never logs the API key or headers. Cache and
 * idempotency keys are derived from sha256(language + voice + text) so
 * repeated questions never re-bill.
 */
export async function synthesizeAddis(
  text: string,
  options: { language: AddisLanguageCode; voiceId: string }
): Promise<AddisTtsResult | null> {
  const { language, voiceId } = options;
  try {
    const apiKey = process.env.ADDIS_API_KEY;
    if (!apiKey) return null;

    const cappedText = capTextForTts(text ?? "");
    if (!cappedText) return null;

    const contentHash = sha256Hex(`${language}${voiceId}${cappedText}`);
    const cached = audioCache.get(contentHash);
    if (cached) return cached;

    const clientRequestId = deterministicRequestId(contentHash);
    const timeoutMs =
      Number(process.env.ADDIS_TTS_TIMEOUT_MS) > 0
        ? Number(process.env.ADDIS_TTS_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS;

    let outcome = await postGeneration(apiKey, voiceId, language, cappedText, clientRequestId, timeoutMs);
    if (!outcome.ok && outcome.retryable) {
      // Single retry, same idempotency key — the API dedupes the replay.
      outcome = await postGeneration(apiKey, voiceId, language, cappedText, clientRequestId, timeoutMs);
    }

    if (!outcome.ok || !outcome.body) {
      console.warn(
        `[addisTts] synthesis failed (status=${outcome.status ?? "n/a"}): ${outcome.reason ?? "unknown"}`
      );
      return null;
    }

    const rawAudio = outcome.body.data?.audio;
    if (!rawAudio) {
      console.warn("[addisTts] synthesis failed: response had no data.audio field");
      return null;
    }

    const audioBase64 = stripDataUriPrefix(rawAudio);
    if (!audioBase64) {
      console.warn("[addisTts] synthesis failed: empty audio payload");
      return null;
    }

    // Dev-server console only — never sent to the client.
    const credits = outcome.body.usage?.credits_remaining;
    if (typeof credits === "number") {
      console.log(`[addisTts] credits_remaining=${credits}`);
    }

    const result: AddisTtsResult = { audioBase64, provider: "addis" };
    if (audioCache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = audioCache.keys().next().value;
      if (oldestKey !== undefined) audioCache.delete(oldestKey);
    }
    audioCache.set(contentHash, result);
    return result;
  } catch (err) {
    console.warn(
      `[addisTts] unexpected failure: ${err instanceof Error ? err.message : String(err)}`.slice(0, 140)
    );
    return null;
  }
}

/**
 * Backward-compatible Amharic-only wrapper (original FS-2 signature).
 * New code should call synthesizeAddis with a resolved voice.
 */
export async function synthesizeAmharic(
  text: string,
  voiceId: string = process.env.ADDIS_VOICE_ID ?? DEFAULT_VOICE_ID_AM
): Promise<AddisTtsResult | null> {
  return synthesizeAddis(text, { language: "am", voiceId });
}

let healthCache: { at: number; configured: boolean; reachable: boolean } | null = null;

/**
 * Admin health probe for /api/tts/health. Non-billable (voices listing),
 * cached for 60s to avoid hammering the upstream API.
 */
export async function checkAddisHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
}> {
  const apiKey = process.env.ADDIS_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured || !apiKey) return { configured: false, reachable: false };

  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_TTL_MS) {
    return { configured, reachable: healthCache.reachable };
  }

  let reachable = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADDIS_BASE_URL}${VOICES_PATH}?language=am`, {
      method: "GET",
      signal: controller.signal,
      headers: { "x-api-key": apiKey },
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  } finally {
    clearTimeout(timer);
  }

  healthCache = { at: Date.now(), configured, reachable };
  return { configured, reachable };
}

/** Test-only hook: clears the in-memory audio cache. */
export function __clearAddisCacheForTests(): void {
  audioCache.clear();
  healthCache = null;
}

// Minimal zero-dependency test harness (run with: npx tsx tests/run-all.ts)
import assert from "node:assert/strict";

export { assert };

type TestFn = () => Promise<void> | void;
const registry: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void {
  registry.push({ name, fn });
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
  body?: Record<string, unknown>;
}

export const fetchCalls: FetchCall[] = [];

export type FetchHandler = (
  url: string,
  init?: RequestInit
) => Promise<Response> | Response;

let handler: FetchHandler = () => {
  throw new Error("fetch handler not set for this test");
};

export function setFetchHandler(h: FetchHandler): void {
  handler = h;
  fetchCalls.length = 0;
}

export function installFetchMock(): void {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    let parsedBody: Record<string, unknown> | undefined;
    try {
      parsedBody = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
    } catch {
      parsedBody = { __raw: String(init?.body) };
    }
    fetchCalls.push({ url, init, body: parsedBody });

    const signal = init?.signal;
    if (!signal) return handler(url, init);

    // Honor AbortController like real fetch does, so timeout paths are tested.
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => handler(url, init))
        .then(
          (res) => {
            signal.removeEventListener("abort", onAbort);
            resolve(res);
          },
          (err: unknown) => {
            signal.removeEventListener("abort", onAbort);
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        );
    });
  }) as typeof fetch;
}

export async function runAll(): Promise<void> {
  let failed = 0;
  for (const { name, fn } of registry) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${name}`);
      console.error(err);
    }
  }
  console.log(`\n${registry.length - failed}/${registry.length} tests passed`);
  if (failed > 0) process.exit(1);
}

export function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Matches the verified Addis API 201 response envelope.
export function addisCreatedResponse(
  audio = "data:audio/mpeg;base64,QUJD",
  creditsRemaining = 940
): Response {
  return jsonResponse(
    {
      data: {
        audio,
        audio_url: "https://cdn.example.test/audio/abc.mp3",
        duration_seconds: 3.4,
        billable_characters: 42,
      },
      usage: { credits_remaining: creditsRemaining },
    },
    201
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function assertUuidLike(value: unknown): asserts value is string {
  assert.equal(typeof value, "string", "client_request_id should be a string");
  assert.match(value as string, UUID_RE, "client_request_id should be UUID-shaped");
}

export const ADDIS_GENERATIONS_URL =
  "https://api.addisassistant.com/api/v1/voice/generations";
export const ADDIS_VOICES_URL =
  "https://api.addisassistant.com/api/v1/voice/voices";

// Unit tests for src/lib/addisTts.ts — Addis API fully mocked.
import {
  addisCreatedResponse,
  ADDIS_GENERATIONS_URL,
  assert,
  assertUuidLike,
  fetchCalls,
  jsonResponse,
  setEnv,
  setFetchHandler,
  test,
} from "./helpers";
import {
  capTextForTts,
  synthesizeAmharic,
  __clearAddisCacheForTests,
} from "../src/lib/addisTts";

const KEY = "test-addis-key-123";

function reset(): void {
  __clearAddisCacheForTests();
  setEnv("ADDIS_API_KEY", KEY);
  setEnv("ADDIS_VOICE_ID", undefined);
  setEnv("ADDIS_TTS_TIMEOUT_MS", undefined);
}

test("addis: 201 success returns stripped base64 + provider, well-formed request", async () => {
  reset();
  setFetchHandler(() => addisCreatedResponse());

  const result = await synthesizeAmharic("ሰላም አፈር?");
  assert.ok(result, "expected a result");
  assert.equal(result.provider, "addis");
  assert.equal(result.audioBase64, "QUJD"); // data:audio/mpeg;base64, prefix stripped

  assert.equal(fetchCalls.length, 1);
  const call = fetchCalls[0];
  assert.equal(call.url, ADDIS_GENERATIONS_URL);
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], KEY);
  assert.equal(call.body?.voice_id, "am-hamen");
  assert.equal(call.body?.language, "am");
  assert.equal(call.body?.output_format, "mp3_44100");
  assert.equal(call.body?.text, "ሰላም አፈር?");
  assertUuidLike(call.body?.client_request_id);
});

test("addis: same input yields deterministic identical client_request_id across cache miss retry", async () => {
  reset();
  let n = 0;
  setFetchHandler(() => {
    n += 1;
    return n === 1
      ? jsonResponse({ message: "upstream exploded" }, 500)
      : addisCreatedResponse();
  });

  const result = await synthesizeAmharic("deterministic text for retry");
  assert.ok(result, "expected success after one retry");
  assert.equal(fetchCalls.length, 2, "exactly one retry on 5xx");
  const id1 = fetchCalls[0].body?.client_request_id;
  const id2 = fetchCalls[1].body?.client_request_id;
  assertUuidLike(id1);
  assert.equal(id1, id2, "retry must reuse the same idempotency key");
});

test("addis: 401 fails without retry, returns null, never logs the key", async () => {
  reset();
  setFetchHandler(() => jsonResponse({ message: "invalid api key" }, 401));

  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const result = await synthesizeAmharic("unauthorized attempt");
    assert.equal(result, null);
  } finally {
    console.warn = origWarn;
  }
  assert.equal(fetchCalls.length, 1, "4xx must not be retried");
  assert.ok(warnings.length > 0, "a short failure reason should be logged");
  for (const line of warnings) {
    assert.ok(!line.includes(KEY), `log line must never contain the API key: ${line}`);
  }
});

test("addis: persistent 500 → exactly two attempts then null", async () => {
  reset();
  setFetchHandler(() => jsonResponse({ message: "server error" }, 500));
  const result = await synthesizeAmharic("failing synthesis text");
  assert.equal(result, null);
  assert.equal(fetchCalls.length, 2, "one initial attempt + one retry");
});

test("addis: network timeout retries once with same id then returns null", async () => {
  reset();
  setEnv("ADDIS_TTS_TIMEOUT_MS", "50"); // keep the test fast; default is 10s
  setFetchHandler(
    () => new Promise<Response>(() => {}) // never resolves → AbortController fires
  );
  const started = Date.now();
  const result = await synthesizeAmharic("timeout sensitive text");
  const elapsed = Date.now() - started;
  assert.equal(result, null);
  assert.equal(fetchCalls.length, 2, "network/timeout failure retries exactly once");
  assert.ok(elapsed < 3000, `two 50ms timeouts should be fast, took ${elapsed}ms`);
  assert.equal(
    fetchCalls[0].body?.client_request_id,
    fetchCalls[1].body?.client_request_id
  );
});

test("addis: in-memory cache hit avoids a second billable request", async () => {
  reset();
  setFetchHandler(() => addisCreatedResponse());
  const text = "unique cache probe sentence";
  const first = await synthesizeAmharic(text);
  const second = await synthesizeAmharic(text);
  assert.ok(first && second);
  assert.equal(fetchCalls.length, 1, "second identical call must be served from cache");
  assert.equal(second.audioBase64, first.audioBase64);
});

test("addis: missing ADDIS_API_KEY returns null and makes no request", async () => {
  reset();
  setEnv("ADDIS_API_KEY", undefined);
  setFetchHandler(() => {
    throw new Error("fetch must not be called without a key");
  });
  const result = await synthesizeAmharic("ሰላም");
  assert.equal(result, null);
  assert.equal(fetchCalls.length, 0);
});

test("addis: explicit voice id is honored (am-simon)", async () => {
  reset();
  setFetchHandler(() => addisCreatedResponse());
  await synthesizeAmharic("voice probe", "am-simon");
  assert.equal(fetchCalls[0].body?.voice_id, "am-simon");
});

test("addis: text capped at 3 sentences and 400 chars", async () => {
  reset();
  setFetchHandler(() => addisCreatedResponse());
  await synthesizeAmharic("One. Two. Three. Four. Five.");
  assert.equal(fetchCalls[0].body?.text, "One. Two. Three.");

  __clearAddisCacheForTests();
  const long = `${"ልክ ".repeat(200)}.`;
  await synthesizeAmharic(long);
  const sent = String(fetchCalls[1].body?.text);
  assert.ok(sent.length <= 400, `text sent must be <= 400 chars, got ${sent.length}`);
});

test("addis: capTextForTts respects the Ge'ez sentence mark", () => {
  const out = capTextForTts("ቀስት አለ። ዝናብ ይመጣል። ሰብል ይበልጣል። ተጨማሪ ዓረፍተ ነገር። አምስተኛ ዓረፍተ ነገር።");
  const terminators = (out.match(/።/g) ?? []).length;
  assert.ok(terminators <= 3, `expected at most 3 sentences, got ${terminators}`);
});

test("addis: credits_remaining is logged to the dev console (server-side only)", async () => {
  reset();
  setFetchHandler(() => addisCreatedResponse(undefined, 915));
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await synthesizeAmharic("credits logging probe");
  } finally {
    console.log = origLog;
  }
  assert.ok(
    logs.some((l) => l.includes("credits_remaining=915")),
    `expected credits_remaining log, got: ${logs.join(" | ")}`
  );
  for (const line of logs) {
    assert.ok(!line.includes(KEY), "dev log must never contain the API key");
  }
});

test("addis: malformed success payload returns null instead of throwing", async () => {
  reset();
  setFetchHandler(() => jsonResponse({ unexpected: true }, 201));
  const result = await synthesizeAmharic("malformed payload probe");
  assert.equal(result, null);
});

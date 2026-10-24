import { describe, expect, it, vi } from "vitest";
import { REGISTRAR_CHUNK } from "./fixtures";
import { createGeminiProvider, getConfiguredProvider, ProviderError, SYSTEM_PROMPT } from "./provider";

const KEY = "sk-test-secret-key";
const provider = (fetchImpl: typeof fetch) => createGeminiProvider({ apiKey: KEY, model: "test-model" }, fetchImpl);
const input = { question: "Who issues transcripts?", evidence: [REGISTRAR_CHUNK] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Gemini provider adapter", () => {
  it("sends the key as a header and the evidence in the body, and returns the joined text", async () => {
    const fetchImpl = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }] }));

    expect(await provider(fetchImpl as never)(input)).toBe('{"ok":true}');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT);
    expect(body.contents[0].parts[0].text).toContain("Who issues transcripts?");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(init.body).not.toContain(KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps a timeout, an outage and a non-OK status to distinct errors without leaking anything", async () => {
    const timeout = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    const cases: [typeof fetch, string][] = [
      [(async () => { throw timeout; }) as never, "timeout"],
      [(async () => { throw new Error(`connect ECONNREFUSED ${KEY}`); }) as never, "unavailable"],
      [(async () => json({ error: { message: `bad key ${KEY}` } }, 401)) as never, "unavailable"],
    ];
    for (const [fetchImpl, kind] of cases) {
      const error = await provider(fetchImpl)(input).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe(kind);
      expect((error as ProviderError).message).not.toContain(KEY);
    }
  });

  it("rejects a response without any text", async () => {
    for (const body of [{}, { candidates: [] }, { candidates: [{ finishReason: "SAFETY" }] }, { candidates: [{ content: { parts: [{ text: 5 }] } }] }]) {
      await expect(provider((async () => json(body)) as never)(input)).rejects.toMatchObject({ kind: "invalid_response" });
    }
  });
});

describe("provider configuration", () => {
  it("reports a missing or blank key as not_configured", () => {
    for (const env of [{}, { GEMINI_API_KEY: "" }, { GEMINI_API_KEY: "   " }]) {
      expect(() => getConfiguredProvider(env)).toThrowError(expect.objectContaining({ kind: "not_configured" }));
    }
  });

  it("builds a provider when a key is set", () => {
    expect(getConfiguredProvider({ GEMINI_API_KEY: KEY })).toBeTypeOf("function");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createGeminiQueryEmbedder,
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  embedQuerySafely,
  getConfiguredQueryEmbedder,
  normalize,
  QUERY_EMBED_TIMEOUT_MS,
  type QueryEmbedder,
} from "./embeddings";

const config = { apiKey: "test-key", model: "gemini-embedding-001" };
const vectorOf = (length: number, value = 0.1) => Array.from({ length }, () => value);
const okResponse = (values: number[]) => new Response(JSON.stringify({ embedding: { values } }), { status: 200 });

describe("createGeminiQueryEmbedder", () => {
  it("sends the key as a header and asks for 768 dimensions with the query task type", async () => {
    const fetchImpl = vi.fn(async () => okResponse(vectorOf(EMBEDDING_DIMENSIONS)));
    await createGeminiQueryEmbedder(config, fetchImpl as unknown as typeof fetch)("when does the library close");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("models/gemini-embedding-001:embedContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init.body));
    expect(body.taskType).toBe("RETRIEVAL_QUERY");
    expect(body.outputDimensionality).toBe(768);
    expect(body.content.parts[0].text).toBe("when does the library close");
  });

  it("returns a unit-length vector", async () => {
    const fetchImpl = async () => okResponse(vectorOf(EMBEDDING_DIMENSIONS, 3));
    const vector = await createGeminiQueryEmbedder(config, fetchImpl as unknown as typeof fetch)("hello");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  });

  it("maps a timeout, an outage and a non-OK status to distinct kinds", async () => {
    const kindOf = async (fetchImpl: () => Promise<Response>) =>
      createGeminiQueryEmbedder(config, fetchImpl as unknown as typeof fetch)("hello").then(
        () => "no error",
        (error: unknown) => (error instanceof EmbeddingError ? error.kind : "wrong error type"),
      );

    expect(await kindOf(async () => { throw new DOMException("timed out", "TimeoutError"); })).toBe("timeout");
    expect(await kindOf(async () => { throw new TypeError("fetch failed"); })).toBe("unavailable");
    expect(await kindOf(async () => new Response("{}", { status: 500 }))).toBe("unavailable");
    expect(await kindOf(async () => new Response("{}", { status: 429 }))).toBe("unavailable");
  });

  it("rejects a response with the wrong vector length or no vector as invalid_response", async () => {
    const kindOf = async (response: Response) =>
      createGeminiQueryEmbedder(config, (async () => response) as unknown as typeof fetch)("hello").then(
        () => "no error",
        (error: unknown) => (error instanceof EmbeddingError ? error.kind : "wrong error type"),
      );

    expect(await kindOf(okResponse([0.1, 0.2, 0.3]))).toBe("invalid_response");
    expect(await kindOf(new Response(JSON.stringify({}), { status: 200 }))).toBe("invalid_response");
    expect(await kindOf(new Response("not json", { status: 200 }))).toBe("invalid_response");
  });

  it("gives the request a five second limit", () => {
    expect(QUERY_EMBED_TIMEOUT_MS).toBe(5_000);
  });
});

describe("normalize", () => {
  it("scales a vector to length one", () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
  });

  it("leaves an all-zero vector alone instead of dividing by zero", () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("getConfiguredQueryEmbedder", () => {
  it("reports a missing or blank key as not_configured", () => {
    for (const env of [{}, { GEMINI_API_KEY: "   " }]) {
      try {
        getConfiguredQueryEmbedder(env);
        throw new Error("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError);
        expect((error as EmbeddingError).kind).toBe("not_configured");
      }
    }
  });

  it("builds an embedder when a key is set", () => {
    expect(typeof getConfiguredQueryEmbedder({ GEMINI_API_KEY: "k" })).toBe("function");
  });
});

describe("embedQuerySafely", () => {
  it("returns the vector on success", async () => {
    const embedder: QueryEmbedder = async () => [1, 0];
    expect(await embedQuerySafely(embedder, "hello")).toEqual([1, 0]);
  });

  it("returns null for every embedding failure kind and for an unexpected error", async () => {
    for (const kind of ["not_configured", "timeout", "unavailable", "invalid_response"] as const) {
      const embedder: QueryEmbedder = async () => { throw new EmbeddingError(kind); };
      expect(await embedQuerySafely(embedder, "hello")).toBeNull();
    }
    const broken: QueryEmbedder = async () => { throw new Error("boom"); };
    expect(await embedQuerySafely(broken, "hello")).toBeNull();
  });
});

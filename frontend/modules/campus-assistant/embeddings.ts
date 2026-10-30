/**
 * Turns a question into an embedding: a list of 768 numbers that places its
 * meaning among the stored texts, so the assistant can find a page or course
 * that says the same thing in different words.
 *
 * Mirrors provider.ts: the key goes in a header (never the URL), the call has a
 * time limit, and every failure becomes an EmbeddingError with a kind. Nothing
 * here may stand between a student and an answer: embedQuerySafely turns any
 * failure into null so the caller falls back to keyword search.
 *
 * The backfill scripts are plain .mjs and have their own client
 * (scripts/lib/gemini-embed.mjs); both use the same model and size.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

/** Must match the vector(768) columns created by the embeddings migration. */
export const EMBEDDING_DIMENSIONS = 768;
/** Embedding the question is one extra call before the answer call, so it gets a short limit. */
export const QUERY_EMBED_TIMEOUT_MS = 5_000;

export type EmbeddingErrorKind = "not_configured" | "timeout" | "unavailable" | "invalid_response";

export class EmbeddingError extends Error {
  constructor(readonly kind: EmbeddingErrorKind) {
    super(`Embedding failed: ${kind}`);
    this.name = "EmbeddingError";
  }
}

/** Embeds one question. Resolves to a unit-length vector of EMBEDDING_DIMENSIONS numbers. */
export type QueryEmbedder = (text: string) => Promise<number[]>;

/** Scales a vector to length one, as the search compares directions. An all-zero vector is returned as is. */
export function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}

export function createGeminiQueryEmbedder(
  config: { apiKey: string; model: string },
  fetchImpl: typeof fetch = fetch,
): QueryEmbedder {
  return async (text) => {
    let response: Response;
    try {
      // The key goes in a header, not the URL, so it cannot end up in request logs.
      response = await fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(config.model)}:embedContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmbeddingError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unavailable");
    }

    if (!response.ok) throw new EmbeddingError("unavailable");

    let values: unknown;
    try {
      values = ((await response.json()) as { embedding?: { values?: unknown } }).embedding?.values;
    } catch {
      throw new EmbeddingError("invalid_response");
    }
    if (
      !Array.isArray(values) ||
      values.length !== EMBEDDING_DIMENSIONS ||
      !values.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new EmbeddingError("invalid_response");
    }
    return normalize(values as number[]);
  };
}

/** Reads GEMINI_API_KEY and the optional CAMPUS_ASSISTANT_EMBEDDING_MODEL from the server environment. */
export function getConfiguredQueryEmbedder(env: Record<string, string | undefined> = process.env): QueryEmbedder {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new EmbeddingError("not_configured");

  return createGeminiQueryEmbedder({
    apiKey,
    model: env.CAMPUS_ASSISTANT_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
  });
}

/** The question's embedding, or null when it could not be made for any reason. */
export async function embedQuerySafely(embedder: QueryEmbedder, text: string): Promise<number[] | null> {
  try {
    return await embedder(text);
  } catch {
    return null;
  }
}

/**
 * Gemini embeddings for the maintenance scripts (embed-campus-content, the
 * retrieval evaluation). Plain .mjs like the other scripts; the app has its
 * own typed client in modules/campus-assistant/embeddings.ts, and both use the
 * same model and vector size.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 60_000;

export const EMBEDDING_MODEL = "gemini-embedding-001";
/** Must match the vector(768) columns created by the embeddings migration. */
export const EMBEDDING_DIMENSIONS = 768;
/** The most texts one batchEmbedContents request accepts. */
export const MAX_BATCH = 100;

const MAX_RATE_LIMIT_RETRIES = 6;
const DEFAULT_WAIT_SECONDS = 30;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long Google's "Please retry in 12.04s" asks us to wait, plus a second of margin. */
function waitMs(detail) {
  const asked = /retry in ([\d.]+)s/i.exec(detail);
  return (asked ? Math.ceil(Number(asked[1])) + 1 : DEFAULT_WAIT_SECONDS) * 1000;
}

/** Scales a vector to length one, as the search compares directions. */
export function normalize(vector) {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}

/**
 * Embeds texts and returns one unit-length vector per text, in input order.
 * `taskType` is "RETRIEVAL_DOCUMENT" for stored text and "RETRIEVAL_QUERY" for questions.
 * The key goes in a header, and no error message ever contains it.
 */
export async function embedTexts(
  texts,
  { apiKey, taskType, model = EMBEDDING_MODEL, fetchImpl = fetch, sleep = defaultSleep, maxRetries = MAX_RATE_LIMIT_RETRIES },
) {
  const vectors = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const request = () => fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // The free tier allows 100 texts a minute, so a large backfill is told to wait; wait and retry.
    let response = await request();
    for (let attempt = 0; response.status === 429 && attempt < maxRetries; attempt += 1) {
      const detail = await response.text();
      if (/PerDay/i.test(detail)) {
        throw new Error("The daily embedding quota is used up. Run the command again tomorrow; rows already embedded are kept.");
      }
      await sleep(waitMs(detail));
      response = await request();
    }
    if (!response.ok) throw new Error(`Embedding request failed (HTTP ${response.status}).`);

    const { embeddings } = await response.json();
    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
      throw new Error(`Embedding response held ${embeddings?.length ?? 0} vectors for ${batch.length} texts.`);
    }
    for (const { values } of embeddings) {
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding response held a vector that is not ${EMBEDDING_DIMENSIONS} numbers long.`);
      }
      vectors.push(normalize(values));
    }
  }
  return vectors;
}

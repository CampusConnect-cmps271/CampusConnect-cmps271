/**
 * Retrieval evaluation: for each question in questions.json, how much of the
 * expected evidence reaches the answer model with keyword search alone and with
 * keyword plus meaning search. It runs the app's own retrieveEvidence, so it
 * measures what ships. Run it with `npm run eval:assistant`; it needs local
 * Supabase (with content embedded by `npm run embed:campus-content`) and
 * GEMINI_API_KEY. It is not part of `npm test`.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { createGeminiQueryEmbedder, DEFAULT_EMBEDDING_MODEL } from "../embeddings";
import { retrieveEvidence } from "../retrieval";
import { MAX_COURSE_EVIDENCE, MAX_PAGE_EVIDENCE } from "../schema";
import questions from "./questions.json";
import { recallAtK } from "./recall";

// Node does not override variables that are already set, so .env.local goes first.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // The file may not exist.
  }
}

/** The evidence the model is sent holds at most this many items. */
const K = MAX_PAGE_EVIDENCE + MAX_COURSE_EVIDENCE;

const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

describe("retrieval evaluation", () => {
  it("compares keyword search with keyword plus meaning search", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SECRET_KEY ?? "";
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) || !key || !apiKey) {
      throw new Error("Needs local Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY) and GEMINI_API_KEY.");
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const embed = createGeminiQueryEmbedder({ apiKey, model: process.env.CAMPUS_ASSISTANT_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL });

    const results = [];
    for (const entry of questions) {
      const keyword = (await retrieveEvidence(supabase, entry.question)).map((chunk) => chunk.chunk_id);
      const hybrid = (await retrieveEvidence(supabase, entry.question, await embed(entry.question))).map((chunk) => chunk.chunk_id);
      results.push({
        ...entry,
        keyword,
        hybrid,
        keywordRecall: recallAtK(keyword, entry.expect, K),
        hybridRecall: recallAtK(hybrid, entry.expect, K),
      });
    }

    const lines = ["", `Recall in the evidence sent to the model (up to ${K} items); 1.00 is best.`, "kind        questions  keyword  hybrid"];
    for (const kind of ["page", "course", "interest", "unrelated"]) {
      const ofKind = results.filter((result) => result.kind === kind);
      lines.push(
        `${kind.padEnd(11)} ${String(ofKind.length).padStart(9)}  ${average(ofKind.map((r) => r.keywordRecall)).toFixed(2).padStart(7)}  ${average(ofKind.map((r) => r.hybridRecall)).toFixed(2).padStart(6)}`,
      );
    }
    lines.push("", "Questions where hybrid search missed something:");
    for (const result of results.filter((r) => r.hybridRecall < 1)) {
      lines.push(`  ${result.id}: expected [${result.expect.join(", ")}], got [${result.hybrid.join(", ")}]`);
    }
    console.log(lines.join("\n"));
  });
});

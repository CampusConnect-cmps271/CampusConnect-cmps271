import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Semantic search needs pgvector, which the in-memory PGlite used by the other
 * database tests does not have, so this runs against the local Supabase stack
 * and skips itself when that is not running.
 */

function localEnv() {
  const path = new URL("../.env.local", import.meta.url);
  const file = existsSync(path) ? readFileSync(path, "utf8") : "";
  const read = (name) => process.env[name] ?? file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
  return { url: read("NEXT_PUBLIC_SUPABASE_URL"), key: read("SUPABASE_SECRET_KEY") };
}

const { url, key } = localEnv();
const isLoopback = Boolean(url) && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const reachable = isLoopback && Boolean(key)
  && await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);

const DIMENSIONS = 768;
/** A vector that points along one axis: two different axes are orthogonal (similarity 0). */
const axis = (index) => `[${Array.from({ length: DIMENSIONS }, (_, i) => (i === index ? 1 : 0)).join(",")}]`;

describe("campus assistant semantic search", { skip: reachable ? false : "local Supabase is not running" }, () => {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const SOURCE = "test-embed-src";

  async function cleanUp() {
    await supabase.from("campus_sources").delete().eq("id", SOURCE);
    await supabase.from("courses").delete().like("code", "ZZTEST %");
  }

  before(async () => {
    await cleanUp();
    const source = await supabase.from("campus_sources").insert({
      id: SOURCE, url: "https://www.aub.edu.lb/test-embed", title: "Test source", publisher: "Test",
      retrieved_at: new Date().toISOString(), content_hash: "0".repeat(64),
    });
    assert.equal(source.error, null);
    const chunks = await supabase.from("campus_source_chunks").insert([
      { id: "test-embed:0", source_id: SOURCE, position: 0, text: "Alpha text", embedding: axis(0) },
      { id: "test-embed:1", source_id: SOURCE, position: 1, text: "Beta text", embedding: axis(1) },
      { id: "test-embed:2", source_id: SOURCE, position: 2, text: "Gamma text" },
    ]);
    assert.equal(chunks.error, null);
    const courses = await supabase.from("courses").insert([
      { code: "ZZTEST 100", name: "Alpha course", description: "About alpha.", credits: 3, department: "Test", embedding: axis(0) },
      { code: "ZZTEST 200", name: "Beta course", description: "About beta.", credits: 3, department: "Test", embedding: axis(1) },
      { code: "ZZTEST 300", name: "Gamma course", description: "About gamma.", credits: 3, department: "Test" },
    ]);
    assert.equal(courses.error, null);
  });
  after(async () => { if (reachable) await cleanUp(); });

  const searchChunks = async (embedding, args = {}) => {
    const { data, error } = await supabase.rpc("search_campus_chunks_semantic", { p_embedding: embedding, ...args });
    assert.equal(error, null);
    return data.filter((row) => row.chunk_id.startsWith("test-embed:"));
  };
  const searchCourses = async (embedding, args = {}) => {
    const { data, error } = await supabase.rpc("search_campus_courses_semantic", { p_embedding: embedding, ...args });
    assert.equal(error, null);
    return data.filter((row) => row.code.startsWith("ZZTEST "));
  };

  it("ranks the nearest chunk first and reports its similarity", async () => {
    const rows = await searchChunks(axis(0), { p_limit: 5, p_min_similarity: -1 });
    assert.equal(rows[0].chunk_id, "test-embed:0");
    assert.ok(Math.abs(rows[0].relevance - 1) < 1e-4);
    assert.equal(rows[0].url, "https://www.aub.edu.lb/test-embed");
  });

  it("ranks the nearest course first", async () => {
    const rows = await searchCourses(axis(1), { p_limit: 5, p_min_similarity: -1 });
    assert.equal(rows[0].code, "ZZTEST 200");
  });

  it("drops rows below the similarity floor", async () => {
    assert.deepEqual(await searchChunks(axis(5), { p_limit: 5, p_min_similarity: 0.5 }), []);
    assert.deepEqual(await searchCourses(axis(5), { p_limit: 5, p_min_similarity: 0.5 }), []);
  });

  it("ignores rows that have no embedding, even with the floor off", async () => {
    const chunkIds = (await searchChunks(axis(5), { p_limit: 10, p_min_similarity: -1 })).map((row) => row.chunk_id);
    assert.ok(!chunkIds.includes("test-embed:2"));
    const codes = (await searchCourses(axis(5), { p_limit: 10, p_min_similarity: -1 })).map((row) => row.code);
    assert.ok(!codes.includes("ZZTEST 300"));
  });

  it("limits the number of rows returned", async () => {
    const { data, error } = await supabase.rpc("search_campus_chunks_semantic", { p_embedding: axis(0), p_limit: 1, p_min_similarity: -1 });
    assert.equal(error, null);
    assert.equal(data.length, 1);
  });

  it("clears a chunk's embedding when its text changes but not when another column does", async () => {
    const unrelated = await supabase.from("campus_source_chunks").update({ position: 9 }).eq("id", "test-embed:1");
    assert.equal(unrelated.error, null);
    let row = await supabase.from("campus_source_chunks").select("embedding").eq("id", "test-embed:1").single();
    assert.notEqual(row.data.embedding, null);

    const changed = await supabase.from("campus_source_chunks").update({ text: "Beta text, edited" }).eq("id", "test-embed:1");
    assert.equal(changed.error, null);
    row = await supabase.from("campus_source_chunks").select("embedding").eq("id", "test-embed:1").single();
    assert.equal(row.data.embedding, null);
  });

  it("clears a course's embedding when its description changes but not when its credits do", async () => {
    const unrelated = await supabase.from("courses").update({ credits: 4 }).eq("code", "ZZTEST 100");
    assert.equal(unrelated.error, null);
    let row = await supabase.from("courses").select("embedding").eq("code", "ZZTEST 100").single();
    assert.notEqual(row.data.embedding, null);

    const changed = await supabase.from("courses").update({ description: "About alpha, revised." }).eq("code", "ZZTEST 100");
    assert.equal(changed.error, null);
    row = await supabase.from("courses").select("embedding").eq("code", "ZZTEST 100").single();
    assert.equal(row.data.embedding, null);
  });
});

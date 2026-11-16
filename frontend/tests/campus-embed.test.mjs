import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embedTexts, EMBEDDING_DIMENSIONS } from "../scripts/lib/gemini-embed.mjs";
import {
  chunkEmbeddingText,
  clubEmbeddingText,
  courseEmbeddingText,
  eventEmbeddingText,
  pendingRows,
  runEmbedding,
} from "../scripts/embed-campus-content.mjs";

const unit = (index) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === index ? 1 : 0));

/** A fetch that answers batchEmbedContents with a vector per request, pointing along an axis chosen by `pick`. */
function fakeFetch(pick = (_text, position) => position) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const embeddings = body.requests.map((request, position) => ({
      values: unit(pick(request.content.parts[0].text, position)).map((value) => value * 5),
    }));
    return new Response(JSON.stringify({ embeddings }), { status: 200 });
  };
  return { impl, calls };
}

describe("embedTexts", () => {
  it("splits 250 texts into 3 requests of at most 100 and returns vectors in input order", async () => {
    const { impl, calls } = fakeFetch((text) => Number(text));
    const texts = Array.from({ length: 250 }, (_, i) => String(i));
    const vectors = await embedTexts(texts, { apiKey: "k", taskType: "RETRIEVAL_DOCUMENT", fetchImpl: impl });

    assert.deepEqual(calls.map((call) => call.body.requests.length), [100, 100, 50]);
    assert.equal(vectors.length, 250);
    assert.equal(vectors[0][0], 1);
    assert.equal(vectors[137][137], 1);
    assert.equal(vectors[249][249], 1);
  });

  it("normalises each vector, asks for 768 dimensions and sends the key as a header", async () => {
    const { impl, calls } = fakeFetch();
    const [vector] = await embedTexts(["hello"], { apiKey: "secret-key", taskType: "RETRIEVAL_DOCUMENT", fetchImpl: impl });

    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-9);
    assert.equal(calls[0].body.requests[0].outputDimensionality, 768);
    assert.equal(calls[0].body.requests[0].taskType, "RETRIEVAL_DOCUMENT");
    assert.equal(calls[0].init.headers["x-goog-api-key"], "secret-key");
    assert.ok(!calls[0].url.includes("secret-key"));
  });

  it("fails clearly on a non-OK status or a wrong vector length without echoing the key", async () => {
    await assert.rejects(
      embedTexts(["a"], { apiKey: "secret-key", taskType: "RETRIEVAL_DOCUMENT", fetchImpl: async () => new Response("{}", { status: 503 }) }),
      (error) => /HTTP 503/.test(error.message) && !error.message.includes("secret-key"),
    );
    const short = async () => new Response(JSON.stringify({ embeddings: [{ values: [1, 2, 3] }] }), { status: 200 });
    await assert.rejects(embedTexts(["a"], { apiKey: "k", taskType: "RETRIEVAL_DOCUMENT", fetchImpl: short }), /768/);
  });
});

const rateLimited = (message) => new Response(JSON.stringify({ error: { code: 429, message } }), { status: 429 });
const oneVector = () => new Response(JSON.stringify({ embeddings: [{ values: unit(0) }] }), { status: 200 });

describe("embedTexts and the rate limit", () => {
  it("waits as long as Google asks after a 429, then succeeds", async () => {
    const answers = [rateLimited("Embed content requests per minute limit exceeded. Please retry in 12.5s."), oneVector()];
    const sleeps = [];
    const vectors = await embedTexts(["a"], {
      apiKey: "k", taskType: "RETRIEVAL_DOCUMENT", fetchImpl: async () => answers.shift(), sleep: async (ms) => { sleeps.push(ms); },
    });
    assert.equal(vectors.length, 1);
    assert.deepEqual(sleeps, [14_000]);
  });

  it("stops at once, without waiting, when the daily quota is used up", async () => {
    const sleeps = [];
    await assert.rejects(
      embedTexts(["a"], {
        apiKey: "k", taskType: "RETRIEVAL_DOCUMENT",
        fetchImpl: async () => rateLimited("Quota exceeded for metric: embed_content_free_tier_requests, limit: 1000 PerDay. Please retry in 3000s."),
        sleep: async (ms) => { sleeps.push(ms); },
      }),
      /daily/i,
    );
    assert.deepEqual(sleeps, []);
  });

  it("gives up with the HTTP status after the allowed number of retries", async () => {
    const sleeps = [];
    await assert.rejects(
      embedTexts(["a"], {
        apiKey: "k", taskType: "RETRIEVAL_DOCUMENT", maxRetries: 2,
        fetchImpl: async () => rateLimited("Please retry in 1s."), sleep: async (ms) => { sleeps.push(ms); },
      }),
      /HTTP 429/,
    );
    assert.equal(sleeps.length, 2);
  });
});

describe("embedding text", () => {
  it("starts a course's text with its code and name and cuts it to 2000 characters", () => {
    const text = courseEmbeddingText({ code: "PSYC 201", name: "Social Psychology", department: "Psychology", description: "x".repeat(5000) });
    assert.ok(text.startsWith("PSYC 201 Social Psychology"));
    assert.ok(text.includes("Psychology"));
    assert.equal(text.length, 2000);
  });

  it("embeds a page chunk's text as it is", () => {
    assert.equal(chunkEmbeddingText({ text: "Libraries are open on weekdays." }), "Libraries are open on weekdays.");
  });

  it("starts a club's text with its name, then its kind, and cuts it to 2000 characters", () => {
    const text = clubEmbeddingText({ name: "Robotics Club", category: "Technology", description: "x".repeat(5000) });
    assert.ok(text.startsWith("Robotics Club. Technology club."));
    assert.equal(text.length, 2000);
  });

  it("starts an event's text with its title and organiser, names the place, and leaves the dates out", () => {
    const text = eventEmbeddingText({
      title: "Robot Demo Night",
      club_name: "Robotics Club",
      category: "Technology",
      location: "Bliss Hall 204",
      description: "Watch robots compete.",
      starts_at: "2026-11-13T16:00:00Z",
    });
    assert.equal(text, "Robot Demo Night. Organised by Robotics Club. Technology event at Bliss Hall 204. Watch robots compete.");
    assert.ok(!text.includes("2026"));
  });

  it("writes an event without an organiser cleanly and cuts it to 2000 characters", () => {
    const base = { title: "Career Fair", club_name: null, category: "Careers", location: "Main Gate" };
    assert.equal(eventEmbeddingText({ ...base, description: "Meet employers." }), "Career Fair. Careers event at Main Gate. Meet employers.");
    assert.equal(eventEmbeddingText({ ...base, description: "x".repeat(5000) }).length, 2000);
  });
});

/** Just enough of the supabase-js query builder: select/eq/is/order/range reads, update/eq writes. */
function fakeClient(tables) {
  const writes = [];
  const client = {
    writes,
    from(table) {
      const state = { table, filterNull: false, equals: [] };
      const builder = {
        select() { return builder; },
        eq(column, value) { state.equals.push([column, value]); return builder; },
        is(column, value) { state.filterNull = column === "embedding" && value === null; return builder; },
        order() { return builder; },
        range(from, to) {
          const rows = (tables[table] ?? [])
            .filter((row) => !state.filterNull || row.embedding == null)
            .filter((row) => state.equals.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        update(values) {
          return { eq(column, value) { writes.push({ table, values, column, value }); return Promise.resolve({ error: null }); } };
        },
      };
      return builder;
    },
  };
  return client;
}

describe("pendingRows and runEmbedding", () => {
  const tables = () => ({
    campus_source_chunks: [{ id: "a:0", text: "one", embedding: null }, { id: "a:1", text: "two", embedding: "[1]" }],
    courses: [{ code: "PSYC 201", name: "Social Psychology", department: "Psychology", description: "People.", embedding: null }],
    clubs: [
      { id: "c1", name: "Robotics Club", category: "Technology", description: "Robots.", verification_status: "verified", embedding: null },
      { id: "c2", name: "Pending Club", category: "Arts", description: "Not yet verified.", verification_status: "pending", embedding: null },
      { id: "c3", name: "Rejected Club", category: "Arts", description: "Turned down.", verification_status: "rejected", embedding: null },
    ],
    events: [
      { id: "e1", title: "Robot Demo", description: "Demo.", location: "Bliss", category: "Technology", club_name: null, status: "published", embedding: null },
      { id: "e2", title: "Secret Draft", description: "Draft.", location: "Bliss", category: "Technology", club_name: null, status: "draft", embedding: null },
      { id: "e3", title: "Called Off", description: "Cancelled.", location: "Bliss", category: "Technology", club_name: null, status: "cancelled", embedding: null },
    ],
  });

  it("reads only rows without an embedding unless asked for all", async () => {
    const client = fakeClient(tables());
    assert.deepEqual((await pendingRows(client, "campus_source_chunks", false)).map((row) => row.id), ["a:0"]);
    assert.deepEqual((await pendingRows(client, "campus_source_chunks", true)).map((row) => row.id), ["a:0", "a:1"]);
  });

  it("writes an embedding for each pending row", async () => {
    const client = fakeClient(tables());
    const embed = async (texts) => texts.map(() => unit(0));
    const counts = await runEmbedding(client, { dryRun: false, all: false, embed });

    assert.deepEqual(counts, { chunks: 1, courses: 1, clubs: 1, events: 1 });
    assert.equal(client.writes.length, 4);
    assert.deepEqual(client.writes.map((write) => [write.table, write.column, write.value]), [
      ["campus_source_chunks", "id", "a:0"],
      ["courses", "code", "PSYC 201"],
      ["clubs", "id", "c1"],
      ["events", "id", "e1"],
    ]);
    assert.match(client.writes[0].values.embedding, /^\[1,0,/);
  });

  it("embeds only verified clubs and published events, so unpublished text never reaches the embedding service", async () => {
    const client = fakeClient(tables());
    const sent = [];
    const embed = async (texts) => { sent.push(...texts); return texts.map(() => unit(0)); };
    await runEmbedding(client, { dryRun: false, all: true, embed });

    assert.deepEqual(
      client.writes.filter((write) => write.table === "clubs" || write.table === "events").map((write) => write.value),
      ["c1", "e1"],
    );
    for (const secret of ["Pending Club", "Rejected Club", "Secret Draft", "Called Off", "Not yet verified", "Draft."]) {
      assert.ok(!sent.some((text) => text.includes(secret)), `${secret} must not be sent`);
    }
  });

  it("filters clubs and events even when reading every row", async () => {
    const client = fakeClient(tables());
    assert.deepEqual((await pendingRows(client, "clubs", true)).map((row) => row.id), ["c1"]);
    assert.deepEqual((await pendingRows(client, "events", true)).map((row) => row.id), ["e1"]);
  });

  it("saves each batch of 100 before embedding the next, so a failure keeps the progress", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ code: `TEST ${i}`, name: "n", department: "d", description: "x", embedding: null }));
    const client = fakeClient({ campus_source_chunks: [], courses: many });
    let calls = 0;
    const embed = async (texts) => {
      calls += 1;
      if (calls === 2) throw new Error("Embedding request failed (HTTP 429).");
      return texts.map(() => unit(0));
    };

    await assert.rejects(runEmbedding(client, { dryRun: false, all: false, embed }), /HTTP 429/);
    assert.equal(client.writes.length, 100);
  });

  it("with --dry-run reads the pending rows but writes and embeds nothing", async () => {
    const client = fakeClient(tables());
    let embedCalls = 0;
    const counts = await runEmbedding(client, { dryRun: true, all: false, embed: async () => { embedCalls += 1; return []; } });

    assert.deepEqual(counts, { chunks: 1, courses: 1, clubs: 1, events: 1 });
    assert.equal(client.writes.length, 0);
    assert.equal(embedCalls, 0);
  });
});

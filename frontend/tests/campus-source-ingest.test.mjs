import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  buildRows, chunkText, contentHash, fetchPage, htmlToText, parseManifest, saveRows, selectContent,
} from "../scripts/ingest-campus-sources.mjs";

const FOOTER = "For various questions, please try contacting us via social media first!";
const source = { id: "demo", title: "Demo", publisher: "AUB", url: "https://www.aub.edu.lb/demo" };

describe("SCRUM-51 campus source ingestion", () => {
  it("accepts the committed manifest", async () => {
    const json = await readFile(new URL("../../supabase/data/campus-sources.json", import.meta.url), "utf8");
    assert.ok(parseManifest(json).length >= 5);
  });

  it("rejects sources outside https aub.edu.lb and duplicate ids", () => {
    const one = (url) => JSON.stringify([{ ...source, url }]);
    for (const url of ["http://www.aub.edu.lb/x", "https://aub.edu.lb.evil.example/x", "https://example.com/aub.edu.lb"]) {
      assert.throws(() => parseManifest(one(url)), url);
    }
    assert.throws(() => parseManifest(JSON.stringify([source, source])));
    assert.throws(() => parseManifest("[]"));
  });

  it("turns HTML into paragraphs without scripts, tags, comments or zero-width characters", () => {
    const html = `<html><head><style>p{}</style><script>alert(1)</script></head><body>
      <nav>Menu</nav><!-- hidden --><div>Registrar&nbsp;office&#58; open</div><p>Ma​y 21, 2027</p>
      <ul><li>One</li><li>مكتبة</li></ul><p> </p></body></html>`;
    assert.equal(htmlToText(html), "Registrar office: open\nMay 21, 2027\nOne\nمكتبة");
  });

  it("keeps the lines between markers and fails loudly when a marker is missing", () => {
    const text = ["Title", "Home > Demo", "Fact one", "Contact Us", "Fact two", FOOTER, "A-Z"].join("\n");
    assert.equal(selectContent(text, { start_after: "Home > Demo" }), "Fact one\nFact two");
    assert.equal(selectContent(text, { start_after: "Home > Demo", end_before: "Fact two" }), "Fact one");
    assert.throws(() => selectContent(text, { start_after: "Missing" }), /start marker/);
    assert.throws(() => selectContent("no footer here"), /end marker/);
  });

  it("packs paragraphs into bounded chunks and splits overlong lines", () => {
    const chunks = chunkText(["a".repeat(10), "b".repeat(10), "c".repeat(25)].join("\n"), 21);
    assert.deepEqual(chunks, ["a".repeat(10) + "\n" + "b".repeat(10), "c".repeat(21), "cccc"]);
    assert.ok(chunkText(("word ".repeat(500)).trim()).every((chunk) => chunk.length <= 900));
    assert.deepEqual(chunkText(""), []);
  });

  it("builds stable rows with a content hash and refuses pages without text", () => {
    const page = { url: source.url, html: `<p>Home > Demo</p><p>Fact</p><p>${FOOTER}</p>` };
    const built = buildRows({ ...source, start_after: "Home > Demo" }, page, "2026-10-24T08:00:00.000Z");
    assert.deepEqual(built.chunks, [{ id: "demo:0", source_id: "demo", position: 0, text: "Fact" }]);
    assert.equal(built.source.content_hash, contentHash("Fact"));
    assert.equal(built.source.retrieved_at, "2026-10-24T08:00:00.000Z");
    assert.throws(() => buildRows(source, { url: source.url, html: `<p>${FOOTER}</p>` }, "now"), /no text/);
  });

  it("rejects a redirect off aub.edu.lb and non-OK responses", async () => {
    const reply = (url, ok = true) => async () => ({ ok, status: ok ? 200 : 500, url, text: async () => "<p>x</p>" });
    await assert.rejects(fetchPage(source, reply("https://evil.example/")), /evil\.example/);
    await assert.rejects(fetchPage(source, reply(source.url, false)), /HTTP 500/);
    assert.equal((await fetchPage(source, reply("https://www.aub.edu.lb/moved"))).url, "https://www.aub.edu.lb/moved");
  });

  it("saves the source, upserts chunks, then trims leftovers, without echoing provider errors", async () => {
    const calls = [];
    const table = (name, error = null) => ({
      upsert: async (rows, options) => { calls.push([name, "upsert", rows, options]); return { error }; },
      delete: () => ({ eq: (column, value) => ({ gte: async (field, min) => { calls.push([name, "delete", column, value, field, min]); return { error }; } }) }),
    });
    const rows = { source: { id: "demo" }, chunks: [{ id: "demo:0" }, { id: "demo:1" }] };
    await saveRows({ from: (name) => table(name) }, rows);
    assert.deepEqual(calls.map((call) => call.slice(0, 2)), [["campus_sources", "upsert"], ["campus_source_chunks", "upsert"], ["campus_source_chunks", "delete"]]);
    assert.deepEqual(calls[2].slice(2), ["source_id", "demo", "position", 2]);

    const failing = { from: (name) => table(name, { code: "42501", message: "secret detail" }) };
    await assert.rejects(saveRows(failing, rows), (error) => /42501/.test(error.message) && !/secret detail/.test(error.message));
  });
});

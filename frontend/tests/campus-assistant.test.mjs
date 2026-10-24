import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { before, after, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const migrationFiles = await readdir(directory);
const [file] = migrationFiles.filter((name) => name.endsWith("_create_campus_assistant_sources.sql"));
assert.ok(file);
const migration = await readFile(new URL(file, directory), "utf8");
const student = "00000000-0000-4000-8000-000000000001";

describe("SCRUM-51 campus source storage and search", () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    `);
    await db.exec(migration);
    await db.exec("grant all on public.campus_sources, public.campus_source_chunks to service_role");
  });
  after(async () => { await db?.close(); });

  async function asRole(role, run) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [student]);
    try { return await run(); } finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
  }
  async function addSource(id, url = `https://www.aub.edu.lb/${id}`) {
    await db.query(
      "insert into public.campus_sources(id,url,title,publisher,retrieved_at,content_hash) values($1,$2,$3,'AUB','2026-10-24T08:00:00Z',repeat('a',64))",
      [id, url, `${id} page`],
    );
  }
  async function addChunk(source, position, text) {
    await db.query("insert into public.campus_source_chunks(id,source_id,position,text) values($1,$2,$3,$4)", [`${source}:${position}`, source, position, text]);
  }
  async function search(query, limit) {
    return (await db.query("select * from public.search_campus_chunks($1,$2)", [query, limit])).rows;
  }

  beforeEach(async () => {
    await db.exec("truncate public.campus_sources cascade");
    await addSource("registrar");
    await addSource("libraries");
    await addChunk("registrar", 0, "The Office of the Registrar issues transcripts and certificates.");
    await addChunk("registrar", 1, "Course registration and scheduling of classes.");
    await addChunk("libraries", 0, "The library offers research support and borrowing services.");
    await addChunk("libraries", 1, "مكتبات الجامعة الأمريكية في بيروت تقدم خدمات البحث.");
  });

  it("only accepts https aub.edu.lb source URLs", async () => {
    for (const url of ["http://www.aub.edu.lb/x", "https://aub.edu.lb.evil.example/x", "https://evil.example/aub.edu.lb/", "javascript:alert(1)"]) {
      await assert.rejects(addSource("bad", url), `${url} should be rejected`);
    }
    await addSource("apex", "https://aub.edu.lb/registrar");
  });

  it("matches any term, ranks the chunk matching most terms first, and returns citation fields", async () => {
    const rows = await asRole("authenticated", () => search("transcripts and certificates from the registrar"));
    assert.equal(rows[0].chunk_id, "registrar:0");
    assert.equal(rows[0].url, "https://www.aub.edu.lb/registrar");
    assert.equal(rows[0].title, "registrar page");
    assert.ok(rows[0].retrieved_at);
  });

  it("matches English word forms, so 'issue a transcript' finds 'issuing transcripts'", async () => {
    await db.query("update public.campus_source_chunks set text = 'The Registrar handles issuing transcripts.' where id = 'registrar:0'");
    const rows = await asRole("authenticated", () => search("issue transcript"));
    assert.equal(rows[0].chunk_id, "registrar:0");
  });

  it("searches Arabic tokens and returns nothing for empty or unmatched queries", async () => {
    await asRole("authenticated", async () => {
      assert.deepEqual((await search("خدمات")).map((row) => row.chunk_id), ["libraries:1"]);
      for (const query of ["", "   ", null, "zzzzzz", "!!! ???"]) assert.deepEqual(await search(query), []);
    });
  });

  it("clamps the limit to 1..10 rows", async () => {
    await db.exec("insert into public.campus_source_chunks(id,source_id,position,text) select 'registrar:' || n, 'registrar', n, 'filler text' from generate_series(20, 40) n");
    await asRole("authenticated", async () => {
      assert.equal((await search("filler", 0)).length, 1);
      assert.equal((await search("filler", 3)).length, 3);
      assert.equal((await search("filler", 500)).length, 10);
    });
  });

  it("lets students read but not write, and keeps anon out", async () => {
    await asRole("authenticated", async () => {
      assert.equal((await db.query("select * from public.campus_sources")).rows.length, 2);
      await assert.rejects(db.query("insert into public.campus_sources(id,url,title,publisher,retrieved_at,content_hash) values('x','https://www.aub.edu.lb/x','t','p',now(),repeat('a',64))"));
      await assert.rejects(db.query("delete from public.campus_source_chunks"));
    });
    await asRole("anon", async () => {
      await assert.rejects(db.query("select * from public.campus_sources"));
      await assert.rejects(search("registrar"));
    });
  });
});

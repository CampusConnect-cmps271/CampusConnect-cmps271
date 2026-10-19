import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { before, after, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const migrationFiles = await readdir(directory);
async function migration(suffix) {
  const matches = migrationFiles.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1);
  return readFile(new URL(matches[0], directory), "utf8");
}
const migrations = await Promise.all(["_create_posts.sql", "_fix_deleted_post_visibility.sql", "_add_post_full_text_search.sql"].map(migration));
const student = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("SCRUM-142 published post full-text search", () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
      insert into auth.users(id) values ('${student}'), ('${other}');
    `);
    for (const sql of migrations) await db.exec(sql);
    await db.exec("grant select on public.posts to service_role");
  });
  after(async () => { await db?.close(); });
  async function insert(n, title, body, author = student, status = "published", date = "2026-10-01T12:00:00Z") {
    await db.query("insert into public.posts(id,author_id,title,body,category,status,created_at) values($1,$2,$3,$4,'General',$5,$6)", [id(n), author, title, body, status, date]);
  }
  beforeEach(async () => {
    await db.exec("truncate public.posts");
    await insert(1, "Library opening hours", "Quiet study space.");
    await insert(2, "Campus updates", "Library opening hours and desk services.", other, "published", "2026-10-02T12:00:00Z");
    await insert(3, "المكتبة والدراسة", "معلومات عن المواعيد والكتب", other);
    await insert(4, "Deleted library post", "Private deleted library text.", student, "deleted", "2026-10-03T12:00:00Z");
  });
  async function asRole(role, run, user = student) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    try { return await run(); } finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
  }
  async function search(query, page = 1, size = 20) {
    return (await db.query("select * from public.search_published_posts($1,$2,$3)", [query, page, size])).rows;
  }
  it("matches English tokens case-insensitively and ranks a title hit above a newer body hit", async () => {
    await asRole("authenticated", async () => {
      const rows = await search("LIBRARY");
      assert.deepEqual(rows.map((row) => row.id), [id(1), id(2)]);
      assert.ok(rows[0].relevance > rows[1].relevance);
    });
  });
  it("matches both title and body Arabic tokens using simple configuration", async () => {
    await asRole("authenticated", async () => {
      for (const word of ["المكتبة", "المواعيد"]) assert.deepEqual((await search(word)).map((row) => row.id), [id(3)]);
    });
  });
  it("requires all keywords, including across the two fields and mixed languages", async () => {
    await insert(5, "المكتبة library", "Mixed language study information.");
    await asRole("authenticated", async () => {
      assert.deepEqual((await search("المكتبة library")).map((row) => row.id), [id(5)]);
      assert.deepEqual((await search("library space")).map((row) => row.id), [id(1)]);
      assert.deepEqual((await search("library services")).map((row) => row.id), [id(2)]);
    });
  });
  it("does not invent stemming or prefix matches under the simple configuration", async () => {
    await asRole("authenticated", async () => {
      for (const query of ["libraries", "libr", "مكتبة"]) assert.deepEqual(await search(query), []);
    });
  });
  it("returns no results for empty, NULL, whitespace or punctuation-only input", async () => {
    await asRole("authenticated", async () => {
      for (const query of [null, "", " \n\t ", "!!!", "***", "() :&|"]) assert.deepEqual(await search(query), []);
    });
  });
  it("treats SQL-looking text and malformed operators as literal data without syntax errors", async () => {
    await asRole("authenticated", async () => {
      assert.deepEqual(await search("'; drop table public.posts; --"), []);
      assert.equal((await search('"library & (')).length, 2);
    });
    assert.equal((await db.query("select count(*)::int as count from public.posts")).rows[0].count, 4);
  });
  it("excludes deleted posts even when their author can read them directly", async () => {
    await asRole("authenticated", async () => {
      assert.equal((await db.query("select id from public.posts where id=$1", [id(4)])).rows.length, 1);
      assert.ok((await search("library")).every((row) => row.id !== id(4)));
    });
    assert.ok((await search("library")).every((row) => row.id !== id(4)));
  });
  it("respects a more restrictive underlying RLS policy without definer privileges", async () => {
    await db.exec(`alter policy "Students can read published posts" on public.posts using (author_id = (select auth.uid()))`);
    try { await asRole("authenticated", async () => assert.deepEqual((await search("library")).map((row) => row.id), [id(1)])); }
    finally { await db.exec(`alter policy "Students can read published posts" on public.posts using (status = 'published' or author_id = (select auth.uid()))`); }
  });
  it("denies anonymous invocation despite broad default function grants", async () => {
    await asRole("anon", () => assert.rejects(search("library"), (error) => error.code === "42501"));
  });
  it("uses invoker security, a fixed empty search path and explicit role grants", async () => {
    const row = (await db.query(`select prosecdef,provolatile,proconfig,
      has_function_privilege('anon',oid,'execute') as anon,
      has_function_privilege('authenticated',oid,'execute') as authenticated
      from pg_proc where oid='public.search_published_posts(text,integer,integer)'::regprocedure`)).rows[0];
    assert.equal(row.prosecdef, false); assert.equal(row.provolatile, "s");
    assert.ok(row.proconfig.includes('search_path=""'));
    assert.equal(row.anon, false); assert.equal(row.authenticated, true);
  });
  it("requires the caller's underlying table privileges", async () => {
    await db.exec("revoke select on public.posts from authenticated");
    try { await asRole("authenticated", () => assert.rejects(search("library"), (error) => error.code === "42501")); }
    finally { await db.exec("grant select on public.posts to authenticated"); }
  });
  it("uses creation time and then ID as deterministic relevance tie-breakers", async () => {
    await insert(5, "Library opening hours", "Quiet study space.");
    await insert(6, "Library opening hours", "Quiet study space.", student, "published", "2026-10-02T12:00:00Z");
    await asRole("authenticated", async () => assert.deepEqual((await search("library")).map((row) => row.id), [id(6), id(5), id(1), id(2)]));
  });
  it("paginates with a single lookahead row and no duplicates between returned pages", async () => {
    await db.exec(`insert into public.posts(id,author_id,title,body,category,created_at)
      select ('10000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        '${student}'::uuid,'paginationtoken','Same synthetic body.','General','2026-10-01'::timestamptz
      from generate_series(100,169) i`);
    await asRole("authenticated", async () => {
      const pages = await Promise.all([1,2,3,4].map((page) => search("paginationtoken", page)));
      assert.deepEqual(pages.map((rows) => rows.length), [21,21,21,10]);
      const visible = pages.flatMap((rows) => rows.slice(0,20).map((row) => row.id));
      assert.equal(new Set(visible).size, 70);
      assert.deepEqual(visible, Array.from({ length: 70 }, (_, index) => id(169-index)));
      assert.deepEqual(await search("paginationtoken", 5), []);
      assert.equal((await search("paginationtoken", 0, 0)).length, 2);
      assert.equal((await search("paginationtoken", null, null)).length, 21);
      assert.equal((await search("paginationtoken", 1, 2147483647)).length, 51);
      assert.deepEqual(await search("paginationtoken", 2147483647, 2147483647), []);
    });
  });
  it("updates search matches after editing, deleting and republishing a post", async () => {
    await db.query("update public.posts set title='Changed title',body='uniqueupdatedword' where id=$1", [id(1)]);
    assert.deepEqual((await search("uniqueupdatedword")).map((row) => row.id), [id(1)]);
    assert.deepEqual((await search("library")).map((row) => row.id), [id(2)]);
    await db.query("update public.posts set status='deleted' where id=$1", [id(1)]);
    assert.deepEqual(await search("uniqueupdatedword"), []);
    await db.query("update public.posts set status='published' where id=$1", [id(1)]);
    assert.deepEqual((await search("uniqueupdatedword")).map((row) => row.id), [id(1)]);
  });
  it("bounds direct RPC query length to 200 characters", async () => {
    assert.equal((await search("library" + " ".repeat(193) + "no-match-token")).length, 2);
  });
  it("returns only selected post fields and the relevance score", async () => {
    const [row] = await search("library");
    assert.deepEqual(Object.keys(row), ["id", "author_id", "title", "body", "category", "created_at", "edited_at", "relevance"]);
    await asRole("service_role", async () => assert.equal((await search("library")).length, 2));
  });
  it("creates a published-only GIN index that can support the matching expression", async () => {
    const { rows } = await db.query("select indexdef from pg_indexes where indexname='posts_published_search_idx'");
    assert.match(rows[0].indexdef, /USING gin/); assert.match(rows[0].indexdef, /status = 'published'/);
    // With only four rows the existing newest-post index is also a cheap path.
    // Use a realistic selective lookup to verify the text-search index plan.
    await db.exec(`insert into public.posts(id,author_id,title,body,category)
      select ('10000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        '${student}'::uuid,'Synthetic filler','Neutral record.','General'
      from generate_series(1000,4999) i;
      analyze public.posts;`);
    await db.exec("set enable_seqscan=off");
    try {
      const { rows: plan } = await db.query(`explain select id from public.posts where status='published' and (
        setweight(to_tsvector('pg_catalog.simple'::regconfig,coalesce(title,'')),'A') ||
        setweight(to_tsvector('pg_catalog.simple'::regconfig,coalesce(body,'')),'B')
      ) @@ plainto_tsquery('pg_catalog.simple'::regconfig,'library')`);
      assert.ok(JSON.stringify(plan).includes("posts_published_search_idx"), JSON.stringify(plan));
    } finally { await db.exec("reset enable_seqscan"); }
  });
});

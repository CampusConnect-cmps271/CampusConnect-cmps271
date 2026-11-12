import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";

/**
 * SCRUM-254: the assistant's club and event search. Meaning search needs
 * pgvector, which the in-memory PGlite used by the other database tests does not
 * have, so this runs against the local Supabase stack and skips itself when that
 * is not running. Everything it creates is named ZZTEST / zztest-.
 */

function localEnv() {
  const path = new URL("../.env.local", import.meta.url);
  const file = existsSync(path) ? readFileSync(path, "utf8") : "";
  const read = (name) => process.env[name] ?? file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    key: read("SUPABASE_SECRET_KEY"),
    publishableKey: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

const { url, key, publishableKey } = localEnv();
const isLoopback = Boolean(url) && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const reachable = isLoopback && Boolean(key)
  && await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);

const DIMENSIONS = 768;
/** A vector that points along one axis: two different axes are orthogonal (similarity 0). */
const axis = (index) => `[${Array.from({ length: DIMENSIONS }, (_, i) => (i === index ? 1 : 0)).join(",")}]`;
const hoursFromNow = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

describe("campus assistant club and event search", { skip: reachable ? false : "local Supabase is not running" }, () => {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let user;

  /** Runs SQL in the local database container; the tables do not let even the secret key delete rows. */
  function sql(statement) {
    execFileSync("docker", ["exec", "supabase_db_campusconnect", "psql", "-U", "postgres", "-c", statement], { stdio: "ignore" });
  }
  function cleanUp() {
    try {
      sql("delete from public.events where title like 'ZZTEST %'; delete from public.clubs where slug like 'zztest-%'");
    } catch {
      console.warn("Could not remove the test rows; delete them by hand: delete from public.events where title like 'ZZTEST %'; delete from public.clubs where slug like 'zztest-%'");
    }
  }

  before(async () => {
    cleanUp();
    const created = await supabase.auth.admin.createUser({
      email: `clubs-events-test-${Date.now()}@mail.aub.edu`, password: "Test-Only-Password-1!", email_confirm: true,
    });
    assert.equal(created.error, null);
    user = created.data.user;

    const verified = { verification_status: "verified", verification_reviewed_at: new Date().toISOString(), verification_reviewed_by: user.id };
    const club = (slug, name, description, extra = {}) => ({ slug, name, description, category: "Technology", ...extra });
    const clubs = await supabase.from("clubs").insert([
      club("zztest-alpha", "ZZTEST Alpha Robotics", "Builds robots every semester.", { ...verified, embedding: axis(0) }),
      club("zztest-beta", "ZZTEST Beta Chess", "Weekly chess games for everyone.", { ...verified, embedding: axis(1) }),
      club("zztest-gamma", "ZZTEST Gamma Drama", "Stage plays and improv nights.", verified),
      // Pending clubs are readable by every student, so the functions themselves must hide them.
      // The status is spelled out: a bulk insert sends null, not the column default, for a missing key.
      club("zztest-pending", "ZZTEST Pending Robotics", "Builds robots, not yet verified.", { verification_status: "pending", embedding: axis(0) }),
    ]);
    assert.equal(clubs.error, null);

    const event = (title, description, extra = {}) => ({
      organizer_id: user.id, title, description, location: "Bliss Hall", category: "Technology",
      starts_at: hoursFromNow(48), ends_at: hoursFromNow(50), status: "published", ...extra,
    });
    const events = await supabase.from("events").insert([
      event("ZZTEST Alpha Robot Demo", "Watch the robots compete.", { embedding: axis(0), club_name: "ZZTEST Alpha Robotics" }),
      event("ZZTEST Beta Chess Night", "Bring a board.", { embedding: axis(1) }),
      event("ZZTEST Gamma Open Mic", "Poems and music."),
      event("ZZTEST Draft Robot Demo", "A draft nobody may see.", { status: "draft", embedding: axis(0) }),
      event("ZZTEST Cancelled Robot Demo", "Called off.", { status: "cancelled", embedding: axis(0) }),
      event("ZZTEST Past Robot Demo", "Already over.", { starts_at: hoursFromNow(-50), ends_at: hoursFromNow(-48), embedding: axis(0) }),
    ]);
    assert.equal(events.error, null);
  });
  after(async () => {
    if (!reachable) return;
    cleanUp();
    if (user) await supabase.auth.admin.deleteUser(user.id);
  });

  const ours = (rows, field) => rows.filter((row) => String(row[field]).toLowerCase().includes("zztest"));
  const call = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    assert.equal(error, null, fn);
    return data;
  };
  const clubSlugs = async (fn, args) => ours(await call(fn, args), "slug").map((row) => row.slug);
  const eventTitles = async (fn, args) => ours(await call(fn, args), "title").map((row) => row.title);

  describe("keyword search", () => {
    it("finds a verified club by name and never a pending one", async () => {
      // Any term matches, so the query leaves out the shared "ZZTEST" prefix. The pending club also says "robots".
      assert.deepEqual(await clubSlugs("search_campus_clubs", { p_query: "robotics", p_limit: 5 }), ["zztest-alpha"]);
    });

    it("finds a published upcoming event, and never a draft, a cancelled or a past one", async () => {
      // The draft, cancelled and past events are all titled "... Robot Demo" too; only the published, upcoming one may come back.
      assert.deepEqual(await eventTitles("search_campus_events", { p_query: "robot demo", p_limit: 5 }), ["ZZTEST Alpha Robot Demo"]);
    });

    it("returns the columns the app builds evidence from", async () => {
      const [row] = ours(await call("search_campus_events", { p_query: "ZZTEST alpha", p_limit: 5 }), "title");
      for (const column of ["id", "title", "description", "starts_at", "ends_at", "location", "category", "club_name", "registration_url", "relevance"]) {
        assert.ok(column in row, column);
      }
      const [club] = ours(await call("search_campus_clubs", { p_query: "ZZTEST alpha", p_limit: 5 }), "slug");
      for (const column of ["slug", "name", "category", "description", "public_website", "relevance"]) {
        assert.ok(column in club, column);
      }
    });

    it("returns nothing for an empty query", async () => {
      assert.deepEqual(await call("search_campus_clubs", { p_query: "", p_limit: 5 }), []);
      assert.deepEqual(await call("search_campus_events", { p_query: "   ", p_limit: 5 }), []);
    });
  });

  describe("meaning search", () => {
    it("ranks the nearest club first and hides a pending club that has an embedding", async () => {
      const slugs = await clubSlugs("search_campus_clubs_semantic", { p_embedding: axis(0), p_limit: 10, p_min_similarity: -1 });
      assert.equal(slugs[0], "zztest-alpha");
      assert.ok(!slugs.includes("zztest-pending"));
    });

    it("ranks the nearest event first and hides drafts, cancelled and past events that have an embedding", async () => {
      const titles = await eventTitles("search_campus_events_semantic", { p_embedding: axis(0), p_limit: 10, p_min_similarity: -1 });
      assert.equal(titles[0], "ZZTEST Alpha Robot Demo");
      for (const hidden of ["ZZTEST Draft Robot Demo", "ZZTEST Cancelled Robot Demo", "ZZTEST Past Robot Demo"]) {
        assert.ok(!titles.includes(hidden), hidden);
      }
    });

    it("drops rows below the similarity floor", async () => {
      assert.deepEqual(await clubSlugs("search_campus_clubs_semantic", { p_embedding: axis(7), p_limit: 10, p_min_similarity: 0.5 }), []);
      assert.deepEqual(await eventTitles("search_campus_events_semantic", { p_embedding: axis(7), p_limit: 10, p_min_similarity: 0.5 }), []);
    });

    it("ignores rows that have no embedding, even with the floor off", async () => {
      const slugs = await clubSlugs("search_campus_clubs_semantic", { p_embedding: axis(7), p_limit: 10, p_min_similarity: -1 });
      assert.ok(!slugs.includes("zztest-gamma"));
      const titles = await eventTitles("search_campus_events_semantic", { p_embedding: axis(7), p_limit: 10, p_min_similarity: -1 });
      assert.ok(!titles.includes("ZZTEST Gamma Open Mic"));
    });

    it("limits the number of rows returned", async () => {
      assert.equal((await call("search_campus_clubs_semantic", { p_embedding: axis(0), p_limit: 1, p_min_similarity: -1 })).length, 1);
      assert.equal((await call("search_campus_events_semantic", { p_embedding: axis(0), p_limit: 1, p_min_similarity: -1 })).length, 1);
    });
  });

  describe("stale embeddings", () => {
    const embeddingOf = async (table, column, value) => {
      const { data, error } = await supabase.from(table).select("embedding").eq(column, value).single();
      assert.equal(error, null);
      return data.embedding;
    };

    it("clears a club's embedding when its description changes but not when its website does", async () => {
      const site = await supabase.from("clubs").update({ public_website: "https://example.org" }).eq("slug", "zztest-beta");
      assert.equal(site.error, null);
      assert.notEqual(await embeddingOf("clubs", "slug", "zztest-beta"), null);

      const text = await supabase.from("clubs").update({ description: "Weekly chess games, now with puzzles." }).eq("slug", "zztest-beta");
      assert.equal(text.error, null);
      assert.equal(await embeddingOf("clubs", "slug", "zztest-beta"), null);
    });

    it("clears an event's embedding when its description changes but not when its registration link does", async () => {
      const link = await supabase.from("events").update({ registration_url: "https://example.org/register" }).eq("title", "ZZTEST Alpha Robot Demo");
      assert.equal(link.error, null);
      assert.notEqual(await embeddingOf("events", "title", "ZZTEST Alpha Robot Demo"), null);

      const text = await supabase.from("events").update({ description: "Watch the robots compete, new venue." }).eq("title", "ZZTEST Alpha Robot Demo");
      assert.equal(text.error, null);
      assert.equal(await embeddingOf("events", "title", "ZZTEST Alpha Robot Demo"), null);
    });
  });

  it("lets a signed-in student, not only the secret key, call all four searches; a signed-out visitor cannot", { skip: publishableKey ? false : "no publishable key" }, async () => {
    // The app searches as the signed-in student, so row-level security and the
    // function grants apply; the secret key used elsewhere here bypasses both.
    const email = `clubs-events-student-${Date.now()}@mail.aub.edu`;
    const password = "Test-Only-Password-1!";
    const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null);
    try {
      const student = createClient(url, publishableKey, { auth: { persistSession: false } });
      const signedIn = await student.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null);
      for (const fn of ["search_campus_clubs", "search_campus_events"]) {
        const { data, error } = await student.rpc(fn, { p_query: "robotics", p_limit: 3 });
        assert.equal(error, null, fn);
        assert.ok(Array.isArray(data), fn);
      }
      for (const fn of ["search_campus_clubs_semantic", "search_campus_events_semantic"]) {
        const { data, error } = await student.rpc(fn, { p_embedding: axis(0), p_limit: 3, p_min_similarity: -1 });
        assert.equal(error, null, fn);
        assert.ok(Array.isArray(data), fn);
      }
      const anonymous = createClient(url, publishableKey, { auth: { persistSession: false } });
      for (const [fn, args] of [
        ["search_campus_clubs", { p_query: "robotics" }],
        ["search_campus_events", { p_query: "robotics" }],
        ["search_campus_clubs_semantic", { p_embedding: axis(0) }],
        ["search_campus_events_semantic", { p_embedding: axis(0) }],
      ]) {
        const refused = await anonymous.rpc(fn, args);
        assert.notEqual(refused.error, null, `${fn}: a signed-out visitor must not be able to search`);
      }
    } finally {
      await supabase.auth.admin.deleteUser(created.data.user.id);
    }
  });
});

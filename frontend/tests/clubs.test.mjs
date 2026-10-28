import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../supabase/migrations/20261025122138_sprint3_clubs.sql", import.meta.url), "utf8");
const ADMIN = "00000000-0000-4000-8000-000000000001";
const REP = "00000000-0000-4000-8000-000000000002";
const STUDENT = "00000000-0000-4000-8000-000000000003";
const CLUB = "00000000-0000-4000-8000-000000000010";

describe("SCRUM-34 to SCRUM-37 club storage and permissions", () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      insert into auth.users values ('${ADMIN}'), ('${REP}'), ('${STUDENT}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.user_roles (user_id uuid primary key, role text not null);
      insert into public.user_roles values ('${ADMIN}', 'administrator'), ('${REP}', 'club_representative'), ('${STUDENT}', 'student');
      create function public.current_user_role() returns text language sql stable security definer set search_path = '' as $$
        select role from public.user_roles where user_id = auth.uid()
      $$;
      create table public.audit_log (actor_id uuid, action text, target_type text, target_id uuid, reason text, metadata jsonb);
      create function public.write_audit_log(text,text,uuid,text,jsonb) returns void language sql security definer set search_path = '' as $$
        insert into public.audit_log values (auth.uid(), $1, $2, $3, $4, $5)
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(migration);
    await db.exec(`
      insert into public.clubs (id,slug,name,description,category,verification_status,verification_reviewed_at,verification_reviewed_by)
      values ('${CLUB}','robotics-club','Robotics Club','Build robots and share engineering skills.','Technology','verified',now(),'${ADMIN}');
      insert into public.club_memberships (club_id,user_id,role) values ('${CLUB}','${REP}','representative');
    `);
  });
  after(async () => db?.close());

  async function asUser(id, operation) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
    try { return await operation(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
  }

  it("keeps stable slugs and rejects invalid verification state", async () => {
    await assert.rejects(db.query("insert into public.clubs (slug,name,description,category) values ('Bad Slug','Bad','Long enough description','Other')"), (e) => e.code === "23514");
    await assert.rejects(db.query("insert into public.clubs (slug,name,description,category,verification_status) values ('bad-state','Bad state','Long enough description','Other','verified')"), (e) => e.code === "23514");
  });

  it("lets authenticated students read clubs but not memberships belonging to others", async () => {
    await asUser(STUDENT, async () => {
      assert.equal((await db.query("select count(*)::int count from public.clubs")).rows[0].count, 1);
      assert.equal((await db.query("select count(*)::int count from public.club_memberships")).rows[0].count, 0);
    });
  });

  it("allows only a verified representative or administrator to publish", async () => {
    await asUser(STUDENT, () => assert.rejects(db.query(`insert into public.club_announcements (club_id,author_id,title,body,status,published_at) values ('${CLUB}','${STUDENT}','Hello club','A student should not publish this.', 'published', now())`), (e) => e.code === "42501"));
    await asUser(REP, async () => {
      await db.query(`insert into public.club_announcements (club_id,author_id,title,body,status,published_at) values ('${CLUB}','${REP}','Robotics workshop','Bring your laptop to our robotics workshop.', 'published', now())`);
    });
    await asUser(STUDENT, async () => assert.equal((await db.query("select count(*)::int count from public.club_announcements")).rows[0].count, 1));
  });

  it("blocks representatives from approving their own club and audits admin decisions", async () => {
    await asUser(REP, () => assert.rejects(db.query(`select public.review_club_verification('${CLUB}','rejected','No')`), (e) => e.code === "42501"));
    await asUser(ADMIN, async () => {
      await db.query(`select public.review_club_verification('${CLUB}','rejected','Documentation needs updating')`);
    });
    assert.equal((await db.query("select action from public.audit_log order by action desc limit 1")).rows[0].action, "club.verification.rejected");
  });
});

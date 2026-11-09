import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readMigration = (name) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

const rolesMigration = await readMigration("20261005010000_roles_and_permissions.sql");
const appLogsSource = await readMigration("20261005103145_create_app_logs.sql");
const monitoringSource = await readMigration("20261109182458_sprint4_monitoring_alerts.sql");
const vercelConfig = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

// pg_cron is a hosted Supabase extension, not part of PGlite. Apply the real
// table/policy portion and the real pruning function, then assert the hosted
// schedule remains present in the migration text.
const appLogsMigration = `${appLogsSource.split("-- Retention:")[0]}commit;`;
const monitoringMigration = monitoringSource.split("-- Hosted scheduling.")[0];

const studentId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";

const foundation = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid()
  returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  insert into auth.users(id, email) values
    ('${studentId}', 'student@mail.aub.edu'),
    ('${adminId}', 'admin@mail.aub.edu');
`;

const auditTable = `
  create table public.audit_log (
    id bigint generated always as identity primary key,
    actor_id uuid not null references auth.users(id),
    action text not null,
    target_type text not null,
    target_id uuid,
    reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  alter table public.audit_log enable row level security;
  revoke all on public.audit_log from anon, authenticated;
  grant select on public.audit_log to authenticated;
  create policy "Administrators can read audit log"
  on public.audit_log for select to authenticated
  using (public.current_user_role() = 'administrator');
`;

async function asUser(database, userId, callback) {
  await database.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await database.exec("reset role; reset request.jwt.claim.sub;");
  }
}

describe("Sprint 4 monitoring database security", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    await database.exec(rolesMigration);
    await database.exec(appLogsMigration);
    await database.exec(auditTable);
    await database.exec(monitoringMigration);
    await database.exec(`
      update public.user_roles set role = 'administrator' where user_id = '${adminId}';
      insert into public.app_logs (created_at, level, source, event)
      values
        ('2026-10-01T00:00:00Z', 'error', 'server', 'old.error'),
        ('2026-11-08T00:00:00Z', 'info', 'server', 'recent.event');
      insert into public.audit_log (actor_id, action, target_type, created_at)
      values
        ('${adminId}', 'old.audit', 'user', '2025-01-01T00:00:00Z'),
        ('${adminId}', 'recent.audit', 'user', '2026-11-08T00:00:00Z');
    `);
  });

  after(async () => database?.close());

  it("allows only administrators to read application logs", async () => {
    await asUser(database, studentId, async () => {
      const hidden = await database.query("select event from public.app_logs");
      assert.equal(hidden.rows.length, 0);
      await assert.rejects(
        database.query(
          "insert into public.app_logs(level, source, event) values ('info', 'client', 'fake.event')",
        ),
        (error) => error.code === "42501",
      );
    });

    await asUser(database, adminId, async () => {
      const visible = await database.query("select event from public.app_logs order by created_at");
      assert.deepEqual(visible.rows.map((row) => row.event), ["old.error", "recent.event"]);
    });
  });

  it("enforces finite retention for every application-owned log table", async () => {
    const { rows: [deleted] } = await database.query(
      "select * from public.prune_monitoring_logs('2026-11-09T00:00:00Z')",
    );
    assert.deepEqual(deleted, { app_logs_deleted: 1, audit_logs_deleted: 1 });

    const appLogs = await database.query("select event from public.app_logs");
    const auditLogs = await database.query("select action from public.audit_log");
    assert.deepEqual(appLogs.rows, [{ event: "recent.event" }]);
    assert.deepEqual(auditLogs.rows, [{ action: "recent.audit" }]);
  });

  it("schedules the pruning function through pg_cron rather than editing cron tables", () => {
    assert.match(monitoringSource, /cron\.schedule\([\s\S]*'prune-monitoring-logs'/);
    assert.match(monitoringSource, /cron\.unschedule\(jobid\)/);
    assert.doesNotMatch(monitoringSource, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?cron\.job\b/i);
  });

  it("uses a Vercel Hobby-compatible daily health schedule", () => {
    assert.deepEqual(vercelConfig.crons, [{
      path: "/api/cron/health",
      schedule: "0 9 * * *",
    }]);
  });
});

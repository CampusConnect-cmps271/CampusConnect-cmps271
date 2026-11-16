import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// SP4-29 / SP4-30: get_api_availability, which the /admin/availability
// dashboard reads through the server's secret-key client.

const readMigration = (name) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

// pg_cron is not part of PGlite: keep app_logs' table and RLS, not its schedule.
const appLogsMigration = `${(await readMigration("20261005103145_create_app_logs.sql")).split("-- Retention:")[0]}commit;`;
const availabilityMigration = await readMigration("20261116130648_api_availability_function.sql");

// Supabase grants new functions to every API role by default; reproduce that so
// the test proves the migration's revokes.
const foundation = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

/** One api.request.completed row, as trackApiRequest writes it. */
const metric = (endpoint, method, status, { hoursAgo = 0, source = "server", event = "api.request.completed" } = {}) =>
  `('${event}', '${source}', 'info', now() - interval '${hoursAgo} hours',
    jsonb_build_object('endpoint', '${endpoint}', 'method', '${method}', 'status', ${typeof status === "number" ? status : `'${status}'`}))`;

describe("SP4-29 get_api_availability", () => {
  let db;

  before(async () => {
    db = new PGlite();
    await db.exec(foundation);
    await db.exec(appLogsMigration);
    await db.exec(availabilityMigration);
    await db.exec(`
      insert into public.app_logs (event, source, level, created_at, context) values
        ${[
          metric("/api/notifications", "GET", 200),
          metric("/api/notifications", "GET", 204),
          metric("/api/notifications", "GET", 404),
          metric("/api/notifications", "GET", 500),
          metric("/api/notifications", "GET", 503),
          metric("/api/campus-assistant", "POST", 200),
          // Outside a 24-hour window, inside a 7-day one.
          metric("/api/campus-assistant", "POST", 502, { hoursAgo: 30 }),
          // Never counted: other events, browser entries, malformed statuses.
          metric("/api/notifications", "GET", 500, { event: "backend.error.unexpected" }),
          metric("/api/notifications", "GET", 500, { source: "client" }),
          metric("/api/notifications", "GET", "oops"),
        ].join(",\n")};
    `);
  });

  after(async () => {
    await db?.close();
  });

  const availability = async (hours) =>
    (await db.query("select * from public.get_api_availability($1)", [hours])).rows;

  it("counts each endpoint's successes, 4xx and 5xx, with 5xx as the only failures", async () => {
    const rows = await availability(24);
    assert.deepEqual(
      rows.map((row) => ({ ...row, availability_percent: Number(row.availability_percent) })),
      [
        {
          endpoint: "/api/campus-assistant", method: "POST", total_requests: 1, successful_requests: 1,
          client_errors: 0, server_errors: 0, availability_percent: 100,
        },
        {
          endpoint: "/api/notifications", method: "GET", total_requests: 5, successful_requests: 2,
          client_errors: 1, server_errors: 2, availability_percent: 60,
        },
      ],
    );
  });

  it("looks back the requested number of hours, clamped to 1..720", async () => {
    const week = await availability(24 * 7);
    assert.equal(week.find((row) => row.endpoint === "/api/campus-assistant").total_requests, 2);
    assert.equal((await availability(0)).length, 2, "0 hours is treated as 1 hour");
    assert.equal((await availability(100000)).find((row) => row.endpoint === "/api/campus-assistant").total_requests, 2);
  });

  it("can be run by the server's secret key only", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(availability(24), (error) => error.code === "42501");
      } finally {
        await db.exec("reset role");
      }
    }
    await db.exec("set role service_role");
    try {
      assert.equal((await availability(24)).length, 2);
    } finally {
      await db.exec("reset role");
    }
  });
});

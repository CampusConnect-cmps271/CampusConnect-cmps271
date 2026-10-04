import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL("../../supabase/migrations/20261004000000_restrict_university_signup.sql", import.meta.url),
  "utf8",
);
const domainCases = await readFile(
  new URL("../../supabase/tests/university_domain.sql", import.meta.url),
  "utf8",
);
const roles = `
  create role supabase_auth_admin;
  create role anon;
  create role authenticated;
  create role unrelated_user;
  create role dashboard_user;
  grant usage on schema public to dashboard_user;
`;

describe("SCRUM-82 Supabase signup hook", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(roles);
    await database.exec(migration);
  });

  after(async () => {
    await database?.close();
  });

  it("passes the 22 SQL domain cases as the Supabase Auth role", async () => {
    await database.exec("set role supabase_auth_admin");
    try {
      await database.exec(domainCases);
    } finally {
      await database.exec("reset role");
    }
  });

  it("runs the dashboard checks without needing membership of the Auth role", async () => {
    const dashboard = new PGlite();
    try {
      await dashboard.exec(roles);
      await dashboard.exec(migration);
      await dashboard.exec(`
        alter function public.hook_restrict_university_email(jsonb) owner to dashboard_user;
        set session authorization dashboard_user;
      `);
      await assert.rejects(
        dashboard.exec("set role supabase_auth_admin"),
        (error) => error.code === "42501" && /permission denied to set role/.test(error.message),
      );
      await dashboard.exec(domainCases);
    } finally {
      await dashboard.close();
    }
  });

  for (const role of ["anon", "authenticated", "unrelated_user"]) {
    it(`prevents ${role} from calling the hook directly`, async () => {
      await database.exec(`set role ${role}`);
      try {
        await assert.rejects(
          database.query("select public.hook_restrict_university_email($1::jsonb)", [
            JSON.stringify({ user: { email: "student@mail.aub.edu" } }),
          ]),
          (error) => error.code === "42501" && /permission denied for function/.test(error.message),
        );
      } finally {
        await database.exec("reset role");
      }
    });
  }

  it("can be applied again without losing the domain rules or permissions", async () => {
    await database.exec(migration);
    await database.exec(domainCases);
    const { rows } = await database.query(`
      select
        has_function_privilege('supabase_auth_admin', 'public.hook_restrict_university_email(jsonb)', 'execute') as auth_allowed,
        has_function_privilege('anon', 'public.hook_restrict_university_email(jsonb)', 'execute') as anon_allowed,
        has_function_privilege('authenticated', 'public.hook_restrict_university_email(jsonb)', 'execute') as user_allowed,
        has_function_privilege('unrelated_user', 'public.hook_restrict_university_email(jsonb)', 'execute') as public_allowed;
    `);
    assert.deepEqual(rows[0], {
      auth_allowed: true,
      anon_allowed: false,
      user_allowed: false,
      public_allowed: false,
    });
  });
});

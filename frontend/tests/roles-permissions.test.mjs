import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261005010000_roles_and_permissions.sql",
    import.meta.url,
  ),
  "utf8",
);

const studentId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";
const newcomerId = "00000000-0000-4000-8000-000000000003";

const foundation = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text
  );
  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  insert into auth.users(id, email) values
    ('${studentId}', 'student@mail.aub.edu'),
    ('${adminId}', 'admin@mail.aub.edu');
`;

async function asUser(database, userId, callback) {
  await database.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await database.exec("reset role; reset request.jwt.claim.sub;");
  }
}

describe("SCRUM-16 roles and permissions", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    await database.exec(migration);
    await database.exec(
      `update public.user_roles set role = 'administrator' where user_id = '${adminId}'`,
    );
  });

  after(async () => {
    await database?.close();
  });

  it("backfills existing accounts and defaults new accounts to student", async () => {
    await database.exec(
      `insert into auth.users(id, email) values ('${newcomerId}', 'new@mail.aub.edu')`,
    );

    const { rows } = await database.query(
      "select user_id, role::text from public.user_roles order by user_id",
    );

    assert.deepEqual(rows, [
      { user_id: studentId, role: "student" },
      { user_id: adminId, role: "administrator" },
      { user_id: newcomerId, role: "student" },
    ]);
  });

  it("lets a signed-in user read only their own role", async () => {
    await asUser(database, studentId, async () => {
      const { rows } = await database.query(
        "select user_id, role::text from public.user_roles order by user_id",
      );
      assert.deepEqual(rows, [{ user_id: studentId, role: "student" }]);

      const role = await database.query(
        "select public.current_user_role()::text as role",
      );
      assert.equal(role.rows[0].role, "student");
    });
  });

  it("rejects role listing and assignment by a non-administrator", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query("select * from public.admin_list_users(null)"),
        (error) => error.code === "42501" && /Administrator role required/.test(error.message),
      );
      await assert.rejects(
        database.query(
          "select public.admin_assign_role($1::uuid, 'moderator'::public.app_role)",
          [newcomerId],
        ),
        (error) => error.code === "42501" && /Administrator role required/.test(error.message),
      );
    });
  });

  it("lets an administrator search users and assign a role", async () => {
    await asUser(database, adminId, async () => {
      const search = await database.query(
        "select email, role::text from public.admin_list_users('new@')",
      );
      assert.deepEqual(search.rows, [{ email: "new@mail.aub.edu", role: "student" }]);

      await database.query(
        "select public.admin_assign_role($1::uuid, 'moderator'::public.app_role)",
        [newcomerId],
      );

      const assigned = await database.query(
        "select role::text from public.user_roles where user_id = $1",
        [newcomerId],
      );
      assert.equal(assigned.rows[0].role, "moderator");
    });
  });

  it("does not expose administrator functions to anonymous users", async () => {
    await database.exec("set role anon");
    try {
      await assert.rejects(
        database.query("select * from public.admin_list_users(null)"),
        (error) => error.code === "42501" && /permission denied for function/.test(error.message),
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("can be applied again without losing roles or permissions", async () => {
    await database.exec(migration);

    const roles = await database.query(
      "select user_id, role::text from public.user_roles where user_id in ($1, $2) order by user_id",
      [adminId, newcomerId],
    );
    assert.deepEqual(roles.rows, [
      { user_id: adminId, role: "administrator" },
      { user_id: newcomerId, role: "moderator" },
    ]);

    const privileges = await database.query(`
      select
        has_function_privilege(
          'authenticated',
          'public.admin_assign_role(uuid, public.app_role)',
          'execute'
        ) as authenticated_allowed,
        has_function_privilege(
          'anon',
          'public.admin_assign_role(uuid, public.app_role)',
          'execute'
        ) as anon_allowed;
    `);
    assert.deepEqual(privileges.rows[0], {
      authenticated_allowed: true,
      anon_allowed: false,
    });
  });
});

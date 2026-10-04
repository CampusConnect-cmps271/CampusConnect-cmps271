/**
 * Creates (or resets) the confirmed test student used for manual login testing.
 *
 * Usage: npm run seed:test-user
 *
 * Reads TEST_USER_EMAIL / TEST_USER_PASSWORD and the Supabase admin key from
 * .env.local. Deliberately refuses to run against anything but a local
 * Supabase, so it can never create an account on the hosted project.
 */

import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const FULL_NAME = "Test Student";

function fail(message) {
  console.error(`\n  seed:test-user failed: ${message}\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const email = process.env.TEST_USER_EMAIL?.trim().toLowerCase();
const password = process.env.TEST_USER_PASSWORD;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SECRET_KEY", secretKey],
  ["TEST_USER_EMAIL", email],
  ["TEST_USER_PASSWORD", password],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  fail(
    `missing ${missing.join(", ")} in .env.local. Copy .env.example and fill it in.`,
  );
}

let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  fail(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
}

if (!LOCAL_HOSTNAMES.has(hostname)) {
  fail(
    `refusing to run against ${hostname}. This script is for local Supabase only; ` +
      "create accounts on the hosted project through the dashboard.",
  );
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(address) {
  // The admin API has no get-by-email, so page through until we find it.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) fail(`could not list users: ${error.message}`);

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === address,
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }

  return null;
}

const { data: created, error: createError } =
  await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

if (!createError) {
  console.log(`\n  Created confirmed test student: ${email}`);
  console.log(`  id: ${created.user?.id}\n`);
  process.exit(0);
}

// Already seeded: reset the password and make sure it is still confirmed, so
// the script is safe to re-run.
const alreadyExists =
  createError.code === "email_exists" || createError.status === 422;

if (!alreadyExists) {
  fail(`${createError.message} (code: ${createError.code ?? "unknown"})`);
}

const existing = await findUserByEmail(email);

if (!existing) {
  fail(
    `Supabase says ${email} exists but it could not be found. Check the Studio users table.`,
  );
}

const { error: updateError } = await supabase.auth.admin.updateUserById(
  existing.id,
  {
    password,
    email_confirm: true,
    user_metadata: { ...existing.user_metadata, full_name: FULL_NAME },
  },
);

if (updateError) {
  fail(`could not reset the existing test student: ${updateError.message}`);
}

console.log(`\n  Test student already existed; password and confirmation reset.`);
console.log(`  ${email}`);
console.log(`  id: ${existing.id}\n`);

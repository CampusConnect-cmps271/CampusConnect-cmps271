/**
 * Creates (or resets) the demo accounts for the sprint review (SCRUM-182):
 * a student, a moderator and an administrator, with filled-in profiles,
 * their roles, and a handful of sample posts across the categories.
 *
 * Usage:
 *   npm run seed:demo                local Supabase, from .env.local
 *   npm run seed:demo -- --hosted    the hosted project, after you type its ref
 *
 * Local mode reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY and
 * refuses anything but a local Supabase, like seed:test-user.
 *
 * --hosted reads HOSTED_SUPABASE_URL and HOSTED_SUPABASE_SECRET_KEY instead.
 * Keep them in .env.hosted.local, which is never committed. The separate names
 * mean the local keys can never point this at production by accident.
 *
 * Both modes read DEMO_STUDENT_EMAIL / DEMO_STUDENT_PASSWORD,
 * DEMO_MODERATOR_EMAIL / DEMO_MODERATOR_PASSWORD and
 * DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD. Passwords are never printed.
 *
 * Safe to re-run: accounts are reset rather than duplicated, roles and
 * profiles are overwritten, and sample posts are matched by author and title.
 */

import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const HOSTED = process.argv.includes("--hosted");

function fail(message) {
  console.error(`\n  seed:demo failed: ${message}\n`);
  process.exit(1);
}

// The hosted keys live in their own file, read only when asked for.
if (HOSTED) {
  try {
    process.loadEnvFile(".env.hosted.local");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// ---------------------------------------------------------------- demo data

const ACCOUNTS = [
  {
    key: "student",
    env: "DEMO_STUDENT",
    role: "student",
    profile: {
      full_name: "Lina Haddad",
      major: "Computer Science",
      graduation_year: 2027,
      bio: "Third-year CS student. Happy to help with intro programming and always looking for a chess partner.",
      interests: ["Web development", "Chess", "Machine learning"],
    },
  },
  {
    key: "moderator",
    env: "DEMO_MODERATOR",
    role: "moderator",
    profile: {
      full_name: "Karim Mansour",
      major: "Political Studies",
      graduation_year: 2026,
      bio: "Community moderator. Ask me about clubs, events or anything on campus.",
      interests: ["Debate", "Photography", "Hiking"],
    },
  },
  {
    key: "admin",
    env: "DEMO_ADMIN",
    role: "administrator",
    profile: {
      full_name: "Rana Khoury",
      major: "Information Systems",
      graduation_year: 2026,
      bio: "CampusConnect administrator.",
      interests: ["Product design", "Accessibility"],
    },
  },
];

const POSTS = [
  {
    author: "student",
    category: "Academics",
    title: "Study group for the CMPS 271 midterm",
    body: "A few of us are reviewing Scrum, UML and testing before the midterm. We meet in Jafet Library, third floor, Wednesday at 5pm. Bring past exams if you have them. Everyone welcome!",
  },
  {
    author: "student",
    category: "Campus Life",
    title: "Best quiet study spots on campus?",
    body: "Jafet gets packed around exams. Where do you go when you need somewhere quiet to focus? Bonus points for places with outlets.",
  },
  {
    author: "student",
    category: "Housing",
    title: "Looking for a roommate near Bliss Street",
    body: "I have a two-bedroom flat five minutes from Main Gate, available from the spring semester. Looking for a tidy, non-smoking student. Message me for details.",
  },
  {
    author: "moderator",
    category: "Clubs & Events",
    title: "Robotics Club open night this Thursday",
    body: "The Robotics Club is hosting an open night in the engineering labs on Thursday at 6pm. No experience needed. Come see the projects and meet the team.",
  },
  {
    author: "admin",
    category: "General",
    title: "Welcome to CampusConnect",
    body: "This is the place to ask questions, share events and find people to learn with. Please keep posts respectful and on topic. Moderators will remove anything that breaks the community guidelines.",
  },
];

// The student's study-group post sits pinned at the top of their profile.
const PINNED = { author: "student", title: POSTS[0].title };

// A few upvotes so "Top" sorting has something to show: [voter, post title].
const UPVOTES = [
  ["moderator", POSTS[0].title],
  ["admin", POSTS[0].title],
  ["student", POSTS[3].title],
];

// --------------------------------------------------------------- configuration

const url = (HOSTED ? process.env.HOSTED_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
const secretKey = (HOSTED ? process.env.HOSTED_SUPABASE_SECRET_KEY : process.env.SUPABASE_SECRET_KEY)?.trim();
const allowedDomains = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || "mail.aub.edu")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

for (const account of ACCOUNTS) {
  account.email = process.env[`${account.env}_EMAIL`]?.trim().toLowerCase();
  account.password = process.env[`${account.env}_PASSWORD`];
}

const missing = [
  [HOSTED ? "HOSTED_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL", url],
  [HOSTED ? "HOSTED_SUPABASE_SECRET_KEY" : "SUPABASE_SECRET_KEY", secretKey],
  ...ACCOUNTS.flatMap((account) => [
    [`${account.env}_EMAIL`, account.email],
    [`${account.env}_PASSWORD`, account.password],
  ]),
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  fail(
    `missing ${missing.join(", ")}. ` +
      (HOSTED
        ? "Put them in .env.hosted.local (never committed)."
        : "Copy .env.example to .env.local and fill it in."),
  );
}

for (const account of ACCOUNTS) {
  const domain = account.email.split("@")[1];
  if (!allowedDomains.includes(domain)) {
    fail(`${account.env}_EMAIL must be an address at ${allowedDomains.join(" or ")}.`);
  }
}

if (new Set(ACCOUNTS.map((account) => account.email)).size !== ACCOUNTS.length) {
  fail("the three demo accounts need three different email addresses.");
}

let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  fail(`${HOSTED ? "HOSTED_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL"} is not a valid URL.`);
}

if (!HOSTED && !LOCAL_HOSTNAMES.has(hostname)) {
  fail(
    `refusing to seed ${hostname} without --hosted. ` +
      "Local mode only targets a local Supabase.",
  );
}

if (HOSTED) {
  if (LOCAL_HOSTNAMES.has(hostname)) {
    fail("--hosted was given, but HOSTED_SUPABASE_URL points at a local Supabase.");
  }

  const projectRef = hostname.split(".")[0];
  console.log(`\n  About to seed demo accounts and posts into the HOSTED project.`);
  console.log(`  Project ref: ${projectRef}`);
  console.log(`  URL:         ${url}`);
  console.log(`  Accounts:    ${ACCOUNTS.map((account) => account.email).join(", ")}\n`);

  if (!process.stdin.isTTY) {
    fail("--hosted needs an interactive terminal to confirm the project ref.");
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await prompt.question(`  Type the project ref to continue: `)).trim();
  prompt.close();

  if (typed !== projectRef) fail("the project ref did not match. Nothing was changed.");
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------------ helpers

/**
 * False when PostgREST does not know the table: its migration is not applied.
 * A GET, not a HEAD: a HEAD response has no body, so the error code is lost.
 */
async function tableExists(table) {
  const { error } = await supabase.from(table).select("*").limit(0);
  if (!error) return true;
  if (error.code === "PGRST205" || error.code === "42P01") return false;
  fail(`could not check for table ${table}: ${error.message}`);
}

async function findUserByEmail(address) {
  // The admin API has no get-by-email, so page through until we find it.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list users: ${error.message}`);

    const match = data.users.find((user) => user.email?.toLowerCase() === address);
    if (match) return match;
    if (data.users.length < 200) return null;
  }

  return null;
}

/** Creates the confirmed account, or resets its password if it already exists. */
async function upsertAccount(account) {
  const attributes = {
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.profile.full_name },
  };

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    ...attributes,
  });

  if (!error) return { id: data.user.id, created: true };

  // Branch on the code only: Supabase also answers 422 for a weak password.
  if (error.code !== "email_exists" && error.code !== "user_already_exists") {
    fail(`could not create ${account.email}: ${error.message} (code: ${error.code ?? "unknown"})`);
  }

  const existing = await findUserByEmail(account.email);
  if (!existing) fail(`Supabase says ${account.email} exists but it could not be found.`);

  const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
    ...attributes,
    user_metadata: { ...existing.user_metadata, full_name: account.profile.full_name },
  });
  if (updateError) fail(`could not reset ${account.email}: ${updateError.message}`);

  return { id: existing.id, created: false };
}

// --------------------------------------------------------------------- seed

const summary = [];

for (const account of ACCOUNTS) {
  const { id, created } = await upsertAccount(account);
  account.id = id;
  summary.push(`${created ? "created" : "reset  "}  ${account.key.padEnd(9)} ${account.email}`);
}

// Roles (SCRUM-16). The service key bypasses RLS on user_roles.
if (await tableExists("user_roles")) {
  for (const account of ACCOUNTS) {
    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: account.id, role: account.role, updated_at: new Date().toISOString() });
    if (error) fail(`could not set the ${account.key} role: ${error.message}`);
  }
  summary.push("roles     student, moderator, administrator");
} else {
  summary.push("skipped   roles (user_roles table missing)");
}

// Profiles (SP2-60). Pins are set after the posts exist.
const hasProfiles = await tableExists("profiles");
if (hasProfiles) {
  for (const account of ACCOUNTS) {
    const { error } = await supabase.from("profiles").upsert({ id: account.id, ...account.profile });
    if (error) fail(`could not fill the ${account.key} profile: ${error.message}`);
  }
  summary.push("profiles  filled for all three accounts");
} else {
  summary.push("skipped   profiles (profiles table missing)");
}

// Sample posts, matched by author and title so a re-run adds none.
const postIds = new Map();
if (await tableExists("posts")) {
  const { data: categories, error: categoryError } = await supabase.from("categories").select("name");
  if (categoryError) fail(`could not read categories: ${categoryError.message}`);
  const categoryNames = new Set(categories.map((category) => category.name));

  let added = 0;
  for (const post of POSTS) {
    const author = ACCOUNTS.find((account) => account.key === post.author);
    if (!categoryNames.has(post.category)) fail(`category "${post.category}" does not exist.`);

    const { data: existing, error: findError } = await supabase
      .from("posts")
      .select("id")
      .eq("author_id", author.id)
      .eq("title", post.title)
      .eq("status", "published")
      .limit(1);
    if (findError) fail(`could not look up sample posts: ${findError.message}`);

    if (existing.length > 0) {
      postIds.set(post.title, existing[0].id);
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert({ author_id: author.id, title: post.title, body: post.body, category: post.category })
      .select("id")
      .single();
    if (insertError) fail(`could not create "${post.title}": ${insertError.message}`);

    postIds.set(post.title, inserted.id);
    added += 1;
  }
  summary.push(`posts     ${added} added, ${POSTS.length - added} already there`);

  if (await tableExists("post_upvotes")) {
    const votes = UPVOTES.map(([voter, title]) => ({
      user_id: ACCOUNTS.find((account) => account.key === voter).id,
      post_id: postIds.get(title),
    }));
    const { error } = await supabase
      .from("post_upvotes")
      .upsert(votes, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    if (error) fail(`could not add upvotes: ${error.message}`);
    summary.push(`upvotes   ${votes.length} in place`);
  }

  if (hasProfiles) {
    const owner = ACCOUNTS.find((account) => account.key === PINNED.author);
    const { error } = await supabase
      .from("profiles")
      .update({ pinned_post_id: postIds.get(PINNED.title) })
      .eq("id", owner.id);
    if (error) fail(`could not pin the student's post: ${error.message}`);
    summary.push(`pinned    "${PINNED.title}" on the student's profile`);
  }
} else {
  summary.push("skipped   posts (posts table missing)");
}

// Later stories add their demo data here, each skipped while its table is
// missing: SCRUM-61 gives each account a SkillSwap profile with skills that
// match the others', and SCRUM-59 adds one conversation.
for (const [story, table] of [
  ["SCRUM-61 SkillSwap", "skill_profiles"],
  ["SCRUM-59 messaging", "conversations"],
]) {
  summary.push(
    (await tableExists(table))
      ? `pending   ${story}: ${table} exists but this script does not seed it yet`
      : `skipped   ${story} (${table} table missing)`,
  );
}

console.log(`\n  Demo data seeded into ${HOSTED ? `hosted project ${hostname.split(".")[0]}` : "local Supabase"}:\n`);
for (const line of summary) console.log(`  ${line}`);
console.log("");

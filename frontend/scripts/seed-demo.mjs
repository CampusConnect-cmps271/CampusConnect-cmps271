/**
 * Creates (or resets) the demo accounts for the sprint review (SCRUM-182):
 * a student, a moderator and an administrator, with filled-in profiles,
 * their roles, a handful of sample posts across the categories, two
 * SkillSwap posts that match each other, and a Spring 2027 semester plan for
 * the student with demo meeting times (SCRUM-67), and communities with
 * members, followers and posts (SCRUM-236).
 *
 * Usage:
 *   npm run seed:demo                local Supabase, from .env.local
 *   npm run seed:demo:hosted         the hosted project (--hosted), after you type its ref
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
 * The semester plan is written as the signed-in student, with
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or HOSTED_SUPABASE_PUBLISHABLE_KEY).
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

// SCRUM-61: two SkillSwap posts that fit each other, so the board and its
// search have a match to show. Titles and bodies come from the database's
// skillswap_post_text(), the same as posts written through the template.
const SKILLSWAP_POSTS = [
  {
    author: "student",
    can_teach: "Python for CMPS 200: loops, functions, debugging and getting through the first projects.",
    wants_to_learn: "Conversational French. I can read a little but I freeze when I have to speak.",
    meeting_method: "either",
    availability: "Weekday evenings",
    details: "Happy to meet in Jafet or on a call. An hour of each, once a week?",
  },
  {
    author: "moderator",
    can_teach: "French conversation, from beginner to intermediate. Native speaker.",
    wants_to_learn: "Python basics for a data project in my politics course.",
    meeting_method: "in_person",
    availability: "Tuesday and Thursday afternoons",
    details: null,
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

// SCRUM-236: one community per topic, plus a second course one. The two
// course communities are for courses in the student's demo plan; the student
// is in CMPS 202's but not MATH 201's, and not in the machine learning one,
// so "Suggested for you" has a course reason and an interest reason to show.
// Course communities are skipped while their course is not in the catalogue.
const COMMUNITIES = [
  {
    owner: "moderator",
    name: "CMPS 202 study group",
    topic: "course",
    course: "CMPS 202",
    description: "Weekly problem sets and exam reviews for CMPS 202.",
    members: ["student", "admin"],
    followers: [],
    posts: [
      { author: "moderator", category: "Academics", title: "Problem set 3 walkthrough", body: "I wrote up how I approached the recursion questions. Add your own solutions in the comments." },
      { author: "student", category: "Academics", title: "Anyone up for a review before the quiz?", body: "Thinking of going over the last two lectures together. Reply if you want to join." },
    ],
  },
  {
    owner: "admin",
    name: "MATH 201 problem sessions",
    topic: "course",
    course: "MATH 201",
    description: "Working through practice problems together.",
    members: ["moderator"],
    followers: [],
    posts: [
      { author: "admin", category: "Academics", title: "Practice problems for chapter 2", body: "Post the ones you got stuck on and we will work through them." },
      { author: "moderator", category: "Academics", title: "Tips for double integrals", body: "Draw the region first. It saves a lot of time choosing the limits." },
    ],
  },
  {
    owner: "student",
    name: "Chess players",
    topic: "interest",
    description: "Casual games, puzzles and the occasional tournament.",
    members: ["moderator"],
    followers: ["admin"],
    posts: [
      { author: "student", category: "Campus Life", title: "Lunchtime blitz games", body: "Bring a board if you have one. All levels welcome." },
      { author: "moderator", category: "Campus Life", title: "Puzzle of the week", body: "White to move and win in three. Answers in the comments." },
    ],
  },
  {
    owner: "admin",
    name: "Machine learning reading group",
    topic: "interest",
    description: "We read one paper or chapter a week and discuss it.",
    members: ["moderator"],
    followers: [],
    posts: [
      { author: "admin", category: "Academics", title: "This week: decision trees", body: "Read the chapter on decision trees before we meet. Questions welcome here." },
      { author: "moderator", category: "General", title: "Beginner-friendly resources", body: "Share the tutorials and videos that helped you get started." },
    ],
  },
  {
    owner: "moderator",
    name: "Life on campus",
    topic: "student_life",
    description: "Food, clubs, quiet corners and everything else about student life.",
    members: ["student", "admin"],
    followers: [],
    posts: [
      { author: "moderator", category: "Campus Life", title: "Favourite places to eat near campus?", body: "Looking for new lunch spots. What do you recommend?" },
      { author: "student", category: "Campus Life", title: "Clubs worth joining this semester", body: "Which clubs did you enjoy last year? Share why." },
    ],
  },
  {
    owner: "student",
    name: "Housing near campus",
    topic: "housing",
    description: "Rooms, roommates and tips for living near campus.",
    members: ["admin"],
    followers: ["moderator"],
    posts: [
      { author: "student", category: "Housing", title: "What to check before signing a lease", body: "Share what you wish you had asked your landlord before moving in." },
      { author: "admin", category: "Housing", title: "Looking for a roommate thread", body: "Post what you are looking for: budget, move-in date and habits." },
    ],
  },
  {
    owner: "admin",
    name: "Ask CampusConnect",
    topic: "other",
    description: "Questions and ideas about CampusConnect itself.",
    members: ["student", "moderator"],
    followers: [],
    posts: [
      { author: "admin", category: "General", title: "What should we build next?", body: "Tell us which feature would help you most this semester." },
      { author: "student", category: "General", title: "Communities are live", body: "You can now start a community for a course or an interest." },
    ],
  },
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

// SkillSwap posts, matched by author and title like the sample posts; their
// details are upserted, so a re-run changes nothing.
if (await tableExists("post_skillswap")) {
  let added = 0;
  for (const swap of SKILLSWAP_POSTS) {
    const author = ACCOUNTS.find((account) => account.key === swap.author);

    const { data: built, error: buildError } = await supabase
      .rpc("skillswap_post_text", {
        can_teach: swap.can_teach,
        wants_to_learn: swap.wants_to_learn,
        meeting_method: swap.meeting_method,
        availability: swap.availability,
        details: swap.details,
      })
      .single();
    if (buildError) fail(`could not build a SkillSwap post: ${buildError.message}`);

    const { data: existing, error: findError } = await supabase
      .from("posts")
      .select("id")
      .eq("author_id", author.id)
      .eq("title", built.title)
      .eq("status", "published")
      .limit(1);
    if (findError) fail(`could not look up SkillSwap posts: ${findError.message}`);

    let postId = existing[0]?.id;
    if (!postId) {
      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert({ author_id: author.id, title: built.title, body: built.body, category: "SkillSwap" })
        .select("id")
        .single();
      if (insertError) fail(`could not create a SkillSwap post: ${insertError.message}`);
      postId = inserted.id;
      added += 1;
    }

    const { error: detailsError } = await supabase.from("post_skillswap").upsert({
      post_id: postId,
      can_teach: swap.can_teach,
      wants_to_learn: swap.wants_to_learn,
      meeting_method: swap.meeting_method,
      availability: swap.availability,
      details: swap.details,
    });
    if (detailsError) fail(`could not save SkillSwap details: ${detailsError.message}`);
  }
  summary.push(`skillswap ${added} added, ${SKILLSWAP_POSTS.length - added} already there`);
} else {
  summary.push("skipped   SCRUM-61 SkillSwap (post_skillswap table missing)");
}

// SCRUM-67: a Spring 2027 plan for the student, to show the planner and its
// conflict check. These meeting times are demo entries typed for the
// walkthrough, NOT AUB sections: CMPS 202 and MATH 201 overlap on Tuesday
// 11:00-11:15, and ENGL 203 is left without times. Courses missing from the
// catalogue are skipped. The plan is written as the signed-in student, since
// the planner tables are private under RLS and grant the service role
// nothing. Re-running adds nothing new.
const PLANNER_DEMO = {
  // The official Spring 2026-27 dates, as in modules/planner/terms.ts.
  term: "Spring 2027",
  starts_on: "2027-01-13",
  ends_on: "2027-04-27",
  courses: [
    { code: "CMPS 202", meetings: [[2, "10:00", "11:15"], [4, "10:00", "11:15"]] },
    { code: "MATH 201", meetings: [[2, "11:00", "12:15"], [4, "11:30", "12:45"]] },
    { code: "CMPS 211", meetings: [[1, "14:00", "15:15"], [3, "14:00", "15:15"]] },
    { code: "ENGL 203", meetings: [] },
  ],
};

{
  const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const student = ACCOUNTS.find((account) => account.key === "student");
  const publishableKey = (
    HOSTED ? process.env.HOSTED_SUPABASE_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();
  const asStudent = createClient(url, publishableKey || secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await asStudent.auth.signInWithPassword({
    email: student.email,
    password: student.password,
  });
  if (signInError) fail(`could not sign in as the demo student: ${signInError.message}`);

  const { error: probeError } = await asStudent.from("semester_plans").select("id").limit(0);
  if (probeError?.code === "PGRST205" || probeError?.code === "42P01") {
    summary.push("skipped   SCRUM-67 planner (semester_plans table missing)");
  } else {
    if (probeError) {
      fail(
        `could not read semester_plans as the demo student: ${probeError.message}` +
          (probeError.code === "42501" ? " (set the publishable key so the plan is written as the student)" : ""),
      );
    }

    const { data: found, error: lookupError } = await supabase
      .from("courses")
      .select("id, code")
      .in("code", PLANNER_DEMO.courses.map((course) => course.code));
    if (lookupError) fail(`could not look up the demo plan's courses: ${lookupError.message}`);
    const courseIds = new Map(found.map((row) => [row.code, row.id]));
    const present = PLANNER_DEMO.courses.filter((course) => courseIds.has(course.code));

    if (present.length < 2) {
      summary.push(
        `skipped   SCRUM-67 planner (${present.length} of ${PLANNER_DEMO.courses.length} demo courses in the catalogue; import it first)`,
      );
    } else {
      let { data: plan, error: planError } = await asStudent
        .from("semester_plans")
        .select("id")
        .eq("term", PLANNER_DEMO.term)
        .maybeSingle();
      if (planError) fail(`could not look up the demo plan: ${planError.message}`);
      if (!plan) {
        ({ data: plan, error: planError } = await asStudent
          .from("semester_plans")
          .insert({ term: PLANNER_DEMO.term, starts_on: PLANNER_DEMO.starts_on, ends_on: PLANNER_DEMO.ends_on })
          .select("id")
          .single());
        if (planError) fail(`could not create the demo plan: ${planError.message}`);
      }

      const { data: existing, error: listError } = await asStudent
        .from("plan_courses")
        .select("id, course_id, plan_meetings(weekday, start_minute, end_minute)")
        .eq("plan_id", plan.id);
      if (listError) fail(`could not read the demo plan: ${listError.message}`);

      let coursesAdded = 0;
      let meetingsAdded = 0;
      for (const course of present) {
        let planned = existing.find((row) => row.course_id === courseIds.get(course.code));
        if (!planned) {
          const { data, error } = await asStudent
            .from("plan_courses")
            .insert({ plan_id: plan.id, course_id: courseIds.get(course.code) })
            .select("id")
            .single();
          if (error) fail(`could not add ${course.code} to the demo plan: ${error.message}`);
          planned = { id: data.id, plan_meetings: [] };
          coursesAdded += 1;
        }

        for (const [weekday, start, end] of course.meetings) {
          const [startMinute, endMinute] = [minutesOf(start), minutesOf(end)];
          const known = planned.plan_meetings.some(
            (meeting) => meeting.weekday === weekday && meeting.start_minute === startMinute && meeting.end_minute === endMinute,
          );
          if (known) continue;
          const { error } = await asStudent.from("plan_meetings").insert({
            plan_course_id: planned.id,
            weekday,
            start_minute: startMinute,
            end_minute: endMinute,
            timezone: "Asia/Beirut",
          });
          if (error) fail(`could not add a demo meeting for ${course.code}: ${error.message}`);
          meetingsAdded += 1;
        }
      }
      summary.push(
        `planner   ${PLANNER_DEMO.term}: ${coursesAdded} courses and ${meetingsAdded} demo meetings added ` +
          `(${present.length} of ${PLANNER_DEMO.courses.length} courses in the catalogue)`,
      );
    }
  }
  await asStudent.auth.signOut();
}

// SCRUM-236: communities, their members and followers, and their posts.
// Written with the service role, so the slug comes from the database's
// trigger. Communities are matched by name, members and follows are
// upserted, and posts are matched by author and title: a re-run adds nothing.
if (await tableExists("communities")) {
  const accountId = (key) => ACCOUNTS.find((account) => account.key === key).id;
  const courseCodes = COMMUNITIES.flatMap((community) => (community.course ? [community.course] : []));
  const { data: catalogue, error: courseError } = await supabase.from("courses").select("id, code").in("code", courseCodes);
  if (courseError) fail(`could not look up the communities' courses: ${courseError.message}`);
  const courseIds = new Map(catalogue.map((row) => [row.code, row.id]));

  let created = 0;
  let postsAdded = 0;
  const skipped = [];
  for (const community of COMMUNITIES) {
    if (community.course && !courseIds.has(community.course)) {
      skipped.push(community.course);
      continue;
    }

    let { data: row, error } = await supabase
      .from("communities")
      .select("id, slug")
      .eq("name", community.name)
      .eq("status", "active")
      .maybeSingle();
    if (error) fail(`could not look up "${community.name}": ${error.message}`);
    if (!row) {
      ({ data: row, error } = await supabase
        .from("communities")
        .insert({
          name: community.name,
          description: community.description,
          topic: community.topic,
          course_id: community.course ? courseIds.get(community.course) : null,
          owner_id: accountId(community.owner),
        })
        .select("id, slug")
        .single());
      if (error) fail(`could not create "${community.name}": ${error.message}`);
      created += 1;
    }

    const memberRows = [
      { community_id: row.id, student_id: accountId(community.owner), role: "owner" },
      ...community.members.map((key) => ({ community_id: row.id, student_id: accountId(key), role: "member" })),
    ];
    const { error: memberError } = await supabase
      .from("community_members")
      .upsert(memberRows, { onConflict: "community_id,student_id", ignoreDuplicates: true });
    if (memberError) fail(`could not add members to "${community.name}": ${memberError.message}`);

    // Joining follows, so members follow too, plus anyone who only follows.
    const followerRows = [community.owner, ...community.members, ...community.followers].map((key) => ({
      community_id: row.id,
      student_id: accountId(key),
    }));
    const { error: followError } = await supabase
      .from("community_follows")
      .upsert(followerRows, { onConflict: "community_id,student_id", ignoreDuplicates: true });
    if (followError) fail(`could not add followers to "${community.name}": ${followError.message}`);

    for (const post of community.posts) {
      const authorId = accountId(post.author);
      const { data: existing, error: findError } = await supabase
        .from("posts")
        .select("id")
        .eq("author_id", authorId)
        .eq("title", post.title)
        .eq("status", "published")
        .limit(1);
      if (findError) fail(`could not look up community posts: ${findError.message}`);

      let postId = existing[0]?.id;
      if (!postId) {
        const { data: inserted, error: insertError } = await supabase
          .from("posts")
          .insert({ author_id: authorId, title: post.title, body: post.body, category: post.category })
          .select("id")
          .single();
        if (insertError) fail(`could not create "${post.title}": ${insertError.message}`);
        postId = inserted.id;
        postsAdded += 1;
      }

      const { error: linkError } = await supabase
        .from("community_posts")
        .upsert({ post_id: postId, community_id: row.id }, { onConflict: "post_id", ignoreDuplicates: true });
      if (linkError) fail(`could not link "${post.title}" to "${community.name}": ${linkError.message}`);
    }
  }
  summary.push(
    `communities ${created} added, ${COMMUNITIES.length - created - skipped.length} already there, ${postsAdded} posts added` +
      (skipped.length ? ` (skipped ${skipped.join(", ")}: not in the catalogue)` : ""),
  );
} else {
  summary.push("skipped   SCRUM-236 communities (communities table missing)");
}

// Later stories add their demo data here, each skipped while its table is
// missing: SCRUM-59 adds one conversation.
for (const [story, table] of [
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

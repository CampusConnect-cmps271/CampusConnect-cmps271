import { expect, test, type Page } from "@playwright/test";

// SCRUM-236 against the mocked Supabase (tests/e2e/mock-communities.mjs).
// Each test uses its own students and its own seeded community, so they can
// run in parallel.
const amal = "communities-amal@mail.aub.edu";
const bilal = "communities-bilal@mail.aub.edu";
const carla = "communities-carla@mail.aub.edu";
const dani = "communities-dani@mail.aub.edu";
const phone = "communities-phone@mail.aub.edu";
const keys = "communities-keys@mail.aub.edu";

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // The first visit to /home compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

async function search(page: Page, text: string) {
  const form = page.getByRole("search", { name: "Communities" });
  await form.getByLabel("Search communities").fill(text);
  await form.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(text).replace(/%20/g, "\\+")}`));
}

const found = (page: Page) => page.getByRole("list", { name: "Communities found" });
// The Posts section, which shows Following until All communities is chosen.
const posts = (page: Page) => page.getByRole("region", { name: "Posts", exact: true });

test("a student creates a course community; another finds it, joins and posts; the post reaches followers", async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await browser.newPage();
  await logIn(owner, amal);

  await test.step("create it, linked to a course from the catalogue", async () => {
    await owner.goto("/communities/new");
    await owner.getByRole("button", { name: "Create community" }).click();
    await expect(owner.getByText("Choose a topic.")).toBeVisible();

    await owner.getByLabel("Topic").selectOption("course");
    await owner.getByLabel("Course", { exact: true }).fill("CMPS 240");
    await owner.getByRole("button", { name: "CMPS 240 · Operating Systems" }).click();
    await expect(owner.getByText("CMPS 240 has no community yet. Yours will be the first.")).toBeVisible();
    await owner.getByLabel("Name").fill("CMPS 240 study group");
    await owner.getByLabel(/Description/).fill("Weekly reviews before the midterm.");
    await owner.getByRole("button", { name: "Create community" }).click();

    await expect(owner).toHaveURL(/\/communities\/cmps-240-study-group\?notice=created$/, { timeout: 20_000 });
    await expect(owner.getByText("Community created. You are now its owner and first member.")).toBeVisible();
    await expect(owner.getByRole("heading", { level: 1, name: "CMPS 240 study group" })).toBeVisible();
    await expect(owner.getByRole("link", { name: "CMPS 240 · Operating Systems" })).toHaveAttribute("href", "/courses/CMPS-240");
    await expect(owner.getByText("You own this community and follow it.")).toBeVisible();
    await expect(owner.getByRole("link", { name: "Edit details" })).toBeVisible();
    await expect(owner.getByRole("button", { name: "Archive" })).toBeVisible();
    // The owner cannot leave; they archive instead.
    await expect(owner.getByRole("button", { name: "Leave" })).toHaveCount(0);
  });

  await test.step("a second community for the same course is offered as Join instead", async () => {
    await owner.goto("/communities/new");
    await owner.getByLabel("Topic").selectOption("course");
    await owner.getByLabel("Course", { exact: true }).fill("cmps240");
    await owner.getByRole("button", { name: "CMPS 240 · Operating Systems" }).click();
    const instead = owner.getByRole("region", { name: "Join instead?" });
    await expect(instead.getByRole("link", { name: "CMPS 240 study group" })).toBeVisible();
  });

  await test.step("find it by searching, ignoring case", async () => {
    await owner.goto("/communities");
    await search(owner, "cmps 240 STUDY");
    await expect(found(owner).getByRole("link", { name: "CMPS 240 study group" })).toBeVisible();
  });

  const member = await browser.newPage();
  await logIn(member, bilal);

  await test.step("another student opens it, sees no owner controls, and joins", async () => {
    await member.goto("/communities");
    await search(member, "CMPS 240");
    await found(member).getByRole("link", { name: "CMPS 240 study group" }).click();
    await expect(member).toHaveURL(/\/communities\/cmps-240-study-group$/);
    await expect(member.getByRole("link", { name: "Edit details" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Join to post" })).toBeVisible();

    await member.getByRole("button", { name: "Join", exact: true }).click();
    await expect(member.getByText("You're a member and follow it.")).toBeVisible();
    await expect(member.getByText("2 members · 2 followers")).toBeVisible();
    await expect(member.getByRole("button", { name: "Join to post" })).toHaveCount(0);
  });

  await test.step("a restricted word is refused, then the post goes up", async () => {
    // Write a post from /communities, choosing the community.
    await member.goto("/communities");
    await member.getByLabel("Write a post in").selectOption({ label: "CMPS 240 study group" });
    await member.getByRole("button", { name: "Write post" }).click();
    await expect(member).toHaveURL(/\/communities\/cmps-240-study-group\/new$/);
    await member.getByLabel("Title").fill("Only an idiot skips the review");
    await member.getByLabel("Category").selectOption("Academics");
    await member.getByLabel("Content").fill("Wednesday at 5pm, Jafet third floor.");
    await member.getByRole("button", { name: "Publish post", exact: true }).click();
    await expect(member.locator("main").getByRole("alert")).toContainText("community language guidelines");
    // A refused post keeps everything typed, the chosen category included.
    await expect(member.getByLabel("Category")).toHaveValue("Academics");
    await expect(member.getByLabel("Content")).toHaveValue("Wednesday at 5pm, Jafet third floor.");

    await member.getByLabel("Title").fill("Midterm review on Wednesday");
    await member.getByRole("button", { name: "Publish post", exact: true }).click();
    await expect(member).toHaveURL(/\/communities\/cmps-240-study-group\?notice=posted$/, { timeout: 20_000 });
    await expect(member.getByText("Post published to this community.")).toBeVisible();
    await expect(member.getByRole("link", { name: "Midterm review on Wednesday" })).toBeVisible();
  });

  await test.step("the post is in the owner's Following feed, with its community", async () => {
    await owner.goto("/communities");
    await expect(posts(owner).getByRole("link", { name: "Following" })).toHaveAttribute("aria-current", "page");
    await expect(posts(owner).getByRole("link", { name: "Midterm review on Wednesday" })).toBeVisible();
    await expect(posts(owner).getByRole("link", { name: "CMPS 240 study group" })).toBeVisible();
  });
});

test("unfollowing keeps the membership and empties Following; leaving ends posting", async ({ page }) => {
  test.setTimeout(60_000);
  await logIn(page, carla);
  await page.goto("/communities/board-games-night");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("You're a member and follow it.")).toBeVisible();

  await page.goto("/communities");
  await expect(posts(page).getByRole("link", { name: "Catan this Friday" })).toBeVisible();

  await page.goto("/communities/board-games-night");
  await page.getByRole("button", { name: "Unfollow" }).click();
  await expect(page.getByText("You're a member, not following.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toBeVisible();

  await page.goto("/communities");
  await expect(posts(page).getByRole("link", { name: "Catan this Friday" })).toHaveCount(0);
  await expect(posts(page)).toContainText("Follow a community to see its newest posts here.");

  await page.goto("/communities/board-games-night");
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByText(/Leave Board games night\?/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Leave" })).toBeFocused();
  await page.getByRole("button", { name: "Leave" }).click();
  await page.getByRole("button", { name: "Yes, leave" }).click();

  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Join to post" })).toBeVisible();
  await page.goto("/communities/board-games-night/new");
  await expect(page.getByRole("heading", { name: "Join to post" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);

  // Join to post joins in one click, and New post appears.
  await page.goto("/communities/board-games-night");
  await page.getByRole("button", { name: "Join to post" }).click();
  await expect(page.getByText("You're a member and follow it.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toBeVisible();
});

test("a non-member can read but not post; an archived community refuses joining and posting", async ({ page }) => {
  await logIn(page, dani);

  // All communities shows posts from communities dani doesn't follow, each with its community.
  await page.goto("/communities");
  await expect(posts(page)).toContainText("Follow a community to see its newest posts here.");
  await expect(posts(page)).toContainText("Join a community to post in it.");
  await posts(page).getByRole("link", { name: "All communities" }).click();
  await expect(page).toHaveURL(/posts=all/);
  await expect(posts(page).getByRole("link", { name: "All communities" })).toHaveAttribute("aria-current", "page");
  await expect(posts(page).getByRole("link", { name: "Third floor is quiet today" })).toBeVisible();
  await posts(page).getByRole("link", { name: "Quiet study corners" }).first().click();

  await expect(page).toHaveURL(/\/communities\/quiet-study-corners$/);
  await expect(page.getByRole("link", { name: "Third floor is quiet today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join to post" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toHaveCount(0);
  await page.goto("/communities/quiet-study-corners/new");
  await expect(page.getByRole("heading", { name: "Join to post" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);

  await page.goto("/communities/old-robotics-club");
  await expect(page.getByText(/^Archived on .*takes no new members or posts\.$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Last meetup notes" })).toBeVisible();
  for (const name of ["Join", "Follow", "Leave", "Archive"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "New post" })).toHaveCount(0);
  await page.goto("/communities/old-robotics-club/new");
  await expect(page.getByText("This community is archived, so it takes no new members or posts.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);

  await page.goto("/communities");
  await search(page, "robotics");
  await expect(page.getByText("No communities match “robotics”.", { exact: false })).toBeVisible();

  await page.goto("/communities/no-such-community");
  await expect(page.getByRole("heading", { name: "Community not found" })).toBeVisible();
});

test("communities work at phone width, from the header menu", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, phone);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  await expect(page).toHaveURL(/\/communities$/);
  await expect(page.getByRole("heading", { level: 1, name: "Communities" })).toBeVisible();

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByRole("search", { name: "Communities" }).getByLabel("Topic").selectOption("housing");
  await search(page, "bliss");
  await found(page).getByRole("link", { name: "Housing near Bliss" }).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("You're a member and follow it.")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("a keyboard-only student creates a course community and joins and leaves another", async ({ page }) => {
  await logIn(page, keys);
  await page.goto("/communities/new");

  await page.getByLabel("Topic").focus();
  await page.getByLabel("Topic").selectOption("course");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Course", { exact: true })).toBeFocused();
  await page.keyboard.type("MATH 201");
  await expect(page.getByRole("button", { name: "MATH 201 · Calculus III" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "MATH 201 · Calculus III" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Change course" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Name")).toBeFocused();
  await page.keyboard.type("MATH 201 problem sessions");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Worked problems every Thursday.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create community" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/communities\/math-201-problem-sessions\?notice=created$/, { timeout: 20_000 });

  await page.getByRole("button", { name: "Unfollow" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("You own this community, not following.")).toBeVisible();
  await page.getByRole("button", { name: "Follow", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("You own this community and follow it.")).toBeVisible();

  await page.goto("/communities/photography-walks");
  await page.getByRole("button", { name: "Join", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("You're a member and follow it.")).toBeVisible();
  await page.getByRole("button", { name: "Leave" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Yes, leave" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeVisible();
});

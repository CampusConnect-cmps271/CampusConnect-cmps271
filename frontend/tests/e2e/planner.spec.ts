import { expect, test, type Page } from "@playwright/test";

// SP3-47 (SCRUM-66) against the mocked Supabase (tests/e2e/mock-planner.mjs).
// Each test signs in as its own planner-only student, so they never share
// plans and can run in parallel. Catalogue courses come from mock-courses.mjs.
const students = {
  rana: "planner-rana@mail.aub.edu",
  dupes: "planner-dupes@mail.aub.edu",
  owner: "planner-owner@mail.aub.edu",
  omar: "planner-omar@mail.aub.edu",
  meetings: "planner-meetings@mail.aub.edu",
  phone: "planner-phone@mail.aub.edu",
  keys: "planner-keys@mail.aub.edu",
};

const PLAN_URL = /\/planner\/[0-9a-f-]{36}$/;

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // The first visit to /home compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

/** Opens /planner directly and starts a plan; resolves on the plan's page. */
async function createPlan(page: Page, term: string) {
  await page.goto("/planner");
  await page.getByLabel("Term").selectOption(term);
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(PLAN_URL, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: `${term} plan` })).toBeVisible();
}

async function search(page: Page, text: string) {
  await page.getByLabel("Search the catalogue").fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\?q=/);
}

async function addCourse(page: Page, query: string, code: string) {
  await search(page, query);
  await page.getByRole("button", { name: `Add ${code} to this plan` }).click();
  await expect(planned(page, code)).toBeVisible();
}

const planned = (page: Page, code: string) => page.getByRole("article", { name: new RegExp(`^${code} `) });
const total = (page: Page) => page.getByText(/^Total:/);

test("a fresh student plans a semester from /planner and it survives a reload", async ({ page }) => {
  await logIn(page, students.rana);

  await test.step("/planner opens directly, with no plans yet", async () => {
    await page.goto("/planner");
    await expect(page.getByRole("heading", { level: 1, name: "Semester planner" })).toBeVisible();
    await expect(page.getByText("You have no plans yet.")).toBeVisible();
    await expect(page.getByText(/CampusConnect has no official AUB timetable/)).toBeVisible();
  });

  await test.step("a Spring 2027 plan uses the official calendar dates", async () => {
    await createPlan(page, "Spring 2027");
    await expect(page.getByText("Classes run Wed, 13 Jan 2027 to Tue, 27 Apr 2027")).toBeVisible();
    await expect(page.getByText("No courses yet.")).toBeVisible();
    await expect(total(page)).toHaveText("Total: 0 credits · 0 courses");
  });

  await test.step("two courses add up exactly", async () => {
    await addCourse(page, "CMPS 240", "CMPS 240");
    await addCourse(page, "Computing elective 25", "CMPS 125");
    await expect(total(page)).toHaveText("Total: 6.25 credits · 2 courses");

    const os = planned(page, "CMPS 240");
    await expect(os.getByText("Not checked by CampusConnect")).toBeVisible();
    await expect(os.getByText(/Prerequisite: CMPS101 or CMPS 102/)).toBeVisible();
    await expect(os.getByText("Schedule unknown.")).toBeVisible();
  });

  await test.step("after a reload the courses, order and total are unchanged", async () => {
    await page.reload();
    await expect(total(page)).toHaveText("Total: 6.25 credits · 2 courses");
    await expect(page.getByRole("article").first()).toHaveAccessibleName(/^CMPS 240 /);
    await expect(page.getByRole("article").nth(1)).toHaveAccessibleName(/^CMPS 125 /);
  });

  await test.step("the plan is listed under My plans", async () => {
    await page.goto("/planner");
    await expect(page.getByRole("link", { name: /Spring 2027.*2 courses/ })).toBeVisible();
    await page.getByRole("link", { name: /Spring 2027/ }).click();
    await expect(page).toHaveURL(PLAN_URL);
  });
});

test("duplicates are refused, reordering sticks and removing updates the total", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn(page, students.dupes);
  await createPlan(page, "Summer 2027");
  const planUrl = page.url();

  await test.step("a course added from a stale tab is refused with a message", async () => {
    const staleTab = await context.newPage();
    await staleTab.goto(`${planUrl}?q=MATH%20201`);
    await addCourse(page, "MATH 201", "MATH 201");

    await staleTab.getByRole("button", { name: "Add MATH 201 to this plan" }).click();
    await expect(staleTab.getByText("That course is already in this plan.")).toBeVisible();
    await staleTab.close();

    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(1);
  });

  await test.step("a course already in the plan shows as added in search results", async () => {
    await search(page, "MATH 201");
    await expect(page.getByText("In this plan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add MATH 201 to this plan" })).toHaveCount(0);
  });

  await test.step("Move up reorders, and the order survives a reload", async () => {
    await addCourse(page, "CMPS 126", "CMPS 126");
    await expect(total(page)).toHaveText("Total: 3 credits · 2 courses");

    await page.getByRole("button", { name: "Move CMPS 126 up" }).click();
    await expect(page.getByRole("article").first()).toHaveAccessibleName(/^CMPS 126 /);
    await page.reload();
    await expect(page.getByRole("article").first()).toHaveAccessibleName(/^CMPS 126 /);
    await expect(page.getByRole("button", { name: "Move CMPS 126 up" })).toHaveCount(0);
  });

  await test.step("removing a course updates the total", async () => {
    await page.getByRole("button", { name: "Remove MATH 201 from this plan" }).click();
    await expect(total(page)).toHaveText("Total: 0 credits · 1 course");
    await expect(planned(page, "MATH 201")).toHaveCount(0);
  });

  await context.close();
});

test("tentative meetings can be added and edited, and invalid ones are refused inline", async ({ page }) => {
  await logIn(page, students.meetings);
  await createPlan(page, "Spring 2027");
  await addCourse(page, "MATH 202", "MATH 202");
  const course = planned(page, "MATH 202");

  await test.step("a typed meeting is saved and labelled tentative", async () => {
    await expect(course.getByText("Schedule unknown.")).toBeVisible();
    await course.getByText("Add a meeting for MATH 202").click();
    await course.getByLabel("Day").selectOption("2");
    await course.getByLabel("Starts").fill("09:30");
    await course.getByLabel("Ends").fill("10:45");
    await expect(course.getByLabel("Time zone")).toHaveValue("Asia/Beirut");
    await course.getByRole("button", { name: "Save meeting" }).click();

    await expect(course.getByText("Tue 09:30–10:45 (Asia/Beirut)")).toBeVisible();
    await expect(course.getByText("Tentative, entered by you")).toBeVisible();
    await expect(course.getByText("Schedule unknown.")).toHaveCount(0);
  });

  await test.step("an end before the start shows an inline error and saves nothing", async () => {
    await course.getByLabel("Day").selectOption("4");
    await course.getByLabel("Starts").fill("14:00");
    await course.getByLabel("Ends").fill("13:00");
    await course.getByRole("button", { name: "Save meeting" }).click();

    await expect(course.getByText("The end time must be after the start time.")).toBeVisible();
    await expect(course.getByLabel("Ends")).toHaveAttribute("aria-invalid", "true");
    await expect(course.getByText(/^Thu /)).toHaveCount(0);
    await course.getByText("Add a meeting for MATH 202").click();
  });

  await test.step("editing a meeting changes it, and it survives a reload", async () => {
    // The meeting's own row: the closed "Add a meeting" form has fields too.
    const meeting = course.getByRole("listitem").filter({ hasText: "Tentative, entered by you" });
    await meeting.getByRole("button", { name: "Edit meeting Tue 09:30–10:45 (Asia/Beirut)" }).click();
    await meeting.getByLabel("Ends").fill("11:00");
    await meeting.getByRole("button", { name: "Save changes" }).click();
    await expect(course.getByText("Tue 09:30–11:00 (Asia/Beirut)")).toBeVisible();

    await page.reload();
    await expect(planned(page, "MATH 202").getByText("Tue 09:30–11:00 (Asia/Beirut)")).toBeVisible();
    await expect(planned(page, "MATH 202").getByText("Tentative, entered by you")).toBeVisible();
  });

  await test.step("removing the only meeting makes the schedule unknown again", async () => {
    await planned(page, "MATH 202").getByRole("button", { name: /^Remove meeting Tue/ }).click();
    await expect(planned(page, "MATH 202").getByText("Schedule unknown.")).toBeVisible();
  });
});

test("another student gets a 404 on a plan's URL", async ({ browser }) => {
  const owner = await browser.newPage();
  await logIn(owner, students.owner);
  await createPlan(owner, "Spring 2027");
  await addCourse(owner, "CMPS 240", "CMPS 240");
  const planUrl = owner.url();

  const other = await browser.newPage();
  await logIn(other, students.omar);
  await other.goto(planUrl);
  await expect(other.getByRole("heading", { name: "Plan not found" })).toBeVisible();
  await expect(other.getByText("CMPS 240")).toHaveCount(0);
  await expect(total(other)).toHaveCount(0);

  await other.goto("/planner/not-a-plan-id");
  await expect(other.getByRole("heading", { name: "Plan not found" })).toBeVisible();
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the planner fits without sideways scrolling", async ({ page }) => {
    await logIn(page, students.phone);
    await createPlan(page, "Spring 2027");
    await addCourse(page, "CMPS 240", "CMPS 240");
    await planned(page, "CMPS 240").getByText("Add a meeting for CMPS 240").click();

    await expect(total(page)).toHaveText("Total: 3 credits · 1 course");
    await expect(planned(page, "CMPS 240").getByLabel("Starts")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the planner can be used with the keyboard alone", async ({ page }) => {
  await logIn(page, students.keys);
  await page.goto("/planner");

  // Term, then the calendar link, then Create plan.
  await page.getByLabel("Term").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "official AUB academic calendar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create plan" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(PLAN_URL, { timeout: 20_000 });

  await page.getByLabel("Search the catalogue").focus();
  await page.keyboard.type("MATH");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?q=MATH$/);

  for (const code of ["MATH 201", "MATH 202"]) {
    await page.getByRole("button", { name: `Add ${code} to this plan` }).focus();
    await page.keyboard.press("Enter");
    await expect(planned(page, code)).toBeVisible();
  }

  await page.getByRole("button", { name: "Move MATH 202 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article").first()).toHaveAccessibleName(/^MATH 202 /);
  await expect(total(page)).toHaveText("Total: 6 credits · 2 courses");
});

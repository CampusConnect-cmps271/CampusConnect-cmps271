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
  conflicts: "planner-conflicts@mail.aub.edu",
  incomplete: "planner-incomplete@mail.aub.edu",
  zones: "planner-zones@mail.aub.edu",
};

const PLAN_URL = /\/planner\/[0-9a-f-]{36}$/;

// These journeys save many times in a row against the dev server.
test.describe.configure({ timeout: 90_000 });

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

// SP3-50 (SCRUM-67): conflict warnings, checked against what is saved.

const status = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ hasText: /conflict|No overlaps|No courses to check/ });
const conflictLine = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

/** Adds a meeting through the course's "Add a meeting" form. */
async function addMeeting(page: Page, code: string, day: string, start: string, end: string, timezone?: string) {
  const form = planned(page, code).locator("details");
  if (!(await form.evaluate((details) => (details as HTMLDetailsElement).open))) {
    await form.getByText(`Add a meeting for ${code}`).click();
  }
  await form.getByLabel("Day").selectOption(day);
  await form.getByLabel("Starts").fill(start);
  await form.getByLabel("Ends").fill(end);
  if (timezone) await form.getByLabel("Time zone").fill(timezone);
  const saved = planned(page, code).getByText("Tentative, entered by you");
  const count = await saved.count();
  await form.getByRole("button", { name: "Save meeting" }).click();
  await expect(saved).toHaveCount(count + 1);
}

/** Edits the course's meeting labelled `current`. */
async function editMeeting(page: Page, code: string, current: string, start: string, end: string) {
  const row = planned(page, code).getByRole("listitem").filter({ hasText: current });
  await row.getByRole("button", { name: `Edit meeting ${current}` }).click();
  await row.getByLabel("Starts").fill(start);
  await row.getByLabel("Ends").fill(end);
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toHaveCount(0);
}

test("an overlap is flagged until it is actually fixed, and stays fixed after a reload", async ({ page, browser }) => {
  await logIn(page, students.conflicts);
  await createPlan(page, "Spring 2027");
  await expect(status(page)).toHaveText("No courses to check yet");
  await addCourse(page, "MATH 201", "MATH 201");
  await addCourse(page, "MATH 202", "MATH 202");

  await test.step("a course without times is incomplete, not clear", async () => {
    await addMeeting(page, "MATH 201", "2", "09:30", "10:45");
    await expect(status(page)).toHaveText("No overlaps among the times you entered, but 1 course has no times");
  });

  await test.step("overlapping Tuesday meetings show a conflict naming both courses, the day and the times", async () => {
    await addMeeting(page, "MATH 202", "2", "10:00", "11:15");
    await expect(status(page)).toHaveText("1 conflict found");
    const line = conflictLine(page, "MATH 201 and MATH 202 overlap on Tuesday 10:00–10:45 (Beirut time), every week.");
    await expect(line).toBeVisible();
    await expect(page.getByText("Overlaps another meeting")).toHaveCount(2);

    await line.getByRole("link", { name: "MATH 202" }).click();
    await expect(page).toHaveURL(/#meeting-[0-9a-f-]{36}$/);
    await expect(planned(page, "MATH 202").getByRole("button", { name: /^Edit meeting Tue 10:00–11:15/ })).toBeInViewport();
  });

  await test.step("an unrelated edit leaves the warning in place", async () => {
    await addCourse(page, "CMPS 240", "CMPS 240");
    await addMeeting(page, "CMPS 240", "4", "12:00", "13:00");
    await editMeeting(page, "CMPS 240", "Thu 12:00–13:00 (Asia/Beirut)", "13:00", "14:00");
    await expect(status(page)).toHaveText("1 conflict found");
  });

  await test.step("starting exactly when the other ends clears it", async () => {
    await editMeeting(page, "MATH 202", "Tue 10:00–11:15 (Asia/Beirut)", "10:45", "12:00");
    await expect(status(page)).toHaveText("No conflicts among the times you entered");
    await expect(page.getByText("Overlaps another meeting")).toHaveCount(0);

    await page.reload();
    await expect(status(page)).toHaveText("No conflicts among the times you entered");
    await expect(planned(page, "MATH 202").getByText("Tue 10:45–12:00 (Asia/Beirut)")).toBeVisible();
  });

  await test.step("removing one of two conflicting courses clears the warning", async () => {
    await editMeeting(page, "MATH 202", "Tue 10:45–12:00 (Asia/Beirut)", "10:30", "12:00");
    await expect(status(page)).toHaveText("1 conflict found");
    await page.getByRole("button", { name: "Remove MATH 202 from this plan" }).click();
    await expect(status(page)).toHaveText("No conflicts among the times you entered");
    await page.reload();
    await expect(status(page)).toHaveText("No conflicts among the times you entered");
  });

  await test.step("a second student sees none of it", async () => {
    const planUrl = page.url();
    const other = await browser.newPage();
    await logIn(other, students.omar);
    await other.goto(planUrl);
    await expect(other.getByRole("heading", { name: "Plan not found" })).toBeVisible();
    await expect(other.getByText(/conflict/i)).toHaveCount(0);
    await other.goto("/planner");
    await expect(other.getByText("You have no plans yet.")).toBeVisible();
  });
});

test("a plan with a course that has no times never says there are no conflicts", async ({ page }) => {
  await logIn(page, students.incomplete);
  await createPlan(page, "Summer 2027");
  await addCourse(page, "CMPS 240", "CMPS 240");
  await addCourse(page, "CMPS 241", "CMPS 241");
  await addMeeting(page, "CMPS 240", "1", "09:00", "10:00");

  await expect(status(page)).toHaveText("No overlaps among the times you entered, but 1 course has no times");
  await expect(page.getByText("No conflicts among the times you entered")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "CMPS 241" })).toHaveAttribute("href", /^#course-/);

  await addMeeting(page, "CMPS 241", "3", "09:00", "10:00");
  await expect(status(page)).toHaveText("No conflicts among the times you entered");
  await expect(page.getByText(/check the official AUB schedule/i)).toBeVisible();

  await page.reload();
  await expect(status(page)).toHaveText("No conflicts among the times you entered");
});

test("a Beirut and a New York meeting are flagged only on the dates the clocks make them overlap", async ({ page }) => {
  await logIn(page, students.zones);
  await createPlan(page, "Spring 2027");
  await addCourse(page, "MATH 201", "MATH 201");
  await addCourse(page, "MATH 202", "MATH 202");
  await addMeeting(page, "MATH 201", "1", "08:00", "09:00");
  await addMeeting(page, "MATH 202", "1", "02:00", "03:00", "America/New_York");

  await expect(planned(page, "MATH 202").getByText("Mon 02:00–03:00 (America/New_York)")).toBeVisible();
  await expect(status(page)).toHaveText("1 conflict found");
  await expect(
    conflictLine(page, "overlap on Monday 08:00–09:00 (Beirut time), only on Mon, 15 Mar 2027 and Mon, 22 Mar 2027."),
  ).toBeVisible();

  await test.step("an unknown time zone is refused inline", async () => {
    const form = planned(page, "MATH 201").locator("details");
    await form.getByLabel("Day").selectOption("3");
    await form.getByLabel("Starts").fill("08:00");
    await form.getByLabel("Ends").fill("09:00");
    await form.getByLabel("Time zone").fill("Beirut");
    await form.getByRole("button", { name: "Save meeting" }).click();
    await expect(form.getByText("Enter an IANA time zone, such as Asia/Beirut or America/New_York.")).toBeVisible();
    await expect(planned(page, "MATH 201").getByText(/^Wed /)).toHaveCount(0);
  });
});

import { expect, test, type Page } from "@playwright/test";

// The planner against the mocked Supabase (tests/e2e/mock-planner.mjs). Each
// test signs in as its own planner-only student, so they never share plans
// and can run in parallel. Catalogue courses come from mock-courses.mjs; the
// sections and events are synthetic, not AUB's. Spring 2027 plans link
// themselves to the mock's imported Spring 2026-2027 schedule; other terms
// stay unlinked.
const students = {
  rana: "planner-rana@mail.aub.edu",
  dupes: "planner-dupes@mail.aub.edu",
  owner: "planner-owner@mail.aub.edu",
  omar: "planner-omar@mail.aub.edu",
  phone: "planner-phone@mail.aub.edu",
  keys: "planner-keys@mail.aub.edu",
  conflicts: "planner-conflicts@mail.aub.edu",
  incomplete: "planner-incomplete@mail.aub.edu",
  calendar: "planner-calendar@mail.aub.edu",
  sections: "planner-sections@mail.aub.edu",
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
  // The save and the page's refresh can outlast 5s on a busy CI runner (the button stays disabled meanwhile).
  await expect(planned(page, code)).toBeVisible({ timeout: 15_000 });
}

/** The plan's page without its query, at the week holding `date`. */
async function openWeek(page: Page, date: string) {
  await page.goto(`${new URL(page.url()).pathname}?week=${date}`);
}

const planned = (page: Page, code: string) => page.getByRole("article", { name: new RegExp(`^${code} `) });

/**
 * A course's section picker once React has taken it over. Until then every
 * section lists its linked choices, so labels repeat and an early choice
 * could be undone; afterwards an unchosen section shows a "Linked: …" line
 * instead, which is what this waits for.
 */
async function sectionPicker(page: Page, code: string) {
  const picker = page.getByRole("region", { name: `Choose a section of ${code}` });
  await expect(picker.getByText(/^Linked: CRN/).first()).toBeVisible({ timeout: 20_000 });
  return picker;
}
const total = (page: Page) => page.getByText(/^[\d.]+ credits? · \d+ courses?$/);
const status = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ hasText: /conflict|No courses to check/ });
const conflictLine = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });
const dialog = (page: Page) => page.getByRole("dialog");
/** An hour's square on the calendar grid, e.g. ("2027-02-16", "13:00"); "" for the all-day row. */
const square = (page: Page, date: string, time: string) => page.locator(`[data-slot="${date}T${time}"]`);
const itemOnCalendar = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^Edit ${title}, `) });

/**
 * Clicks until the item dialog opens. The calendar ignores clicks until
 * React has hydrated it, which a cold dev server can take a while to do.
 */
async function openDialog(page: Page, click: () => Promise<void>) {
  await expect(async () => {
    if (!(await dialog(page).isVisible())) await click();
    await expect(dialog(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Clicks the top half of an hour's square, opening a new item at that hour.
 * Clicks its right edge, which classes and events never cover.
 */
async function clickSquare(page: Page, date: string, time: string) {
  const target = square(page, date, time);
  const box = await target.boundingBox();
  if (!box) throw new Error(`No square for ${date} ${time}`);
  await openDialog(page, () => target.click({ position: { x: box.width - 4, y: 4 } }));
}

/** Fills the open item dialog and saves it; the dialog closes once it's saved. */
async function saveItem(page: Page, fields: { title?: string; date?: string; start?: string; end?: string; course?: string }, button = "Save item") {
  const form = dialog(page);
  if (fields.title !== undefined) await form.getByLabel("Title").fill(fields.title);
  if (fields.date !== undefined) await form.getByLabel("Date").fill(fields.date);
  if (fields.start !== undefined) await form.getByLabel("Starts").fill(fields.start);
  if (fields.end !== undefined) await form.getByLabel("Ends").fill(fields.end);
  if (fields.course !== undefined) await form.getByLabel("Course").selectOption({ label: fields.course });
  await form.getByRole("button", { name: button }).click();
  await expect(dialog(page)).toBeHidden({ timeout: 15_000 });
}

test("a fresh student plans a semester from /planner and it survives a reload", async ({ page }) => {
  await logIn(page, students.rana);

  await test.step("/planner opens directly, with no plans yet", async () => {
    await page.goto("/planner");
    await expect(page.getByRole("heading", { level: 1, name: "Semester planner" })).toBeVisible();
    await expect(page.getByText("You have no plans yet.")).toBeVisible();
  });

  await test.step("a Spring 2027 plan uses the official calendar dates and shows its calendar", async () => {
    await createPlan(page, "Spring 2027");
    await expect(page.getByRole("link", { name: "Wed, 13 Jan 2027 – Tue, 27 Apr 2027" })).toBeVisible();
    await expect(page.getByText("No courses yet.")).toBeVisible();
    await expect(total(page)).toHaveText("0 credits · 0 courses");
    await expect(page.getByRole("region", { name: /–.*20\d\d$/ })).toBeVisible();
  });

  await test.step("two courses add up exactly", async () => {
    await addCourse(page, "CMPS 240", "CMPS 240");
    await addCourse(page, "Computing elective 25", "CMPS 125");
    await expect(total(page)).toHaveText("6.25 credits · 2 courses");

    // Credits and times only: no department, prerequisites or "not checked" notes.
    const os = planned(page, "CMPS 240");
    await expect(os.getByText(/Prerequisite/)).toHaveCount(0);
    await expect(os.getByText(/Not checked/)).toHaveCount(0);
    await expect(planned(page, "CMPS 125").getByText("Not in AUB's Spring 2026-2027 schedule")).toBeVisible();
  });

  await test.step("after a reload the courses, order and total are unchanged", async () => {
    await page.reload();
    await expect(total(page)).toHaveText("6.25 credits · 2 courses");
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
    await expect(total(page)).toHaveText("3 credits · 2 courses");

    await page.getByRole("button", { name: "Move CMPS 126 up" }).click();
    await expect(page.getByRole("article").first()).toHaveAccessibleName(/^CMPS 126 /);
    await page.reload();
    await expect(page.getByRole("article").first()).toHaveAccessibleName(/^CMPS 126 /);
    await expect(page.getByRole("button", { name: "Move CMPS 126 up" })).toHaveCount(0);
  });

  await test.step("removing a course updates the total", async () => {
    await page.getByRole("button", { name: "Remove MATH 201 from this plan" }).click();
    await expect(total(page)).toHaveText("0 credits · 1 course");
    await expect(planned(page, "MATH 201")).toHaveCount(0);
  });

  await context.close();
});

test("another student gets a 404 on a plan's URL", async ({ browser }) => {
  const owner = await browser.newPage();
  await logIn(owner, students.owner);
  await createPlan(owner, "Spring 2027");
  await addCourse(owner, "CMPS 240", "CMPS 240");
  const planUrl = new URL(owner.url()).pathname;

  const other = await browser.newPage();
  await logIn(other, students.omar);
  await other.goto(planUrl);
  await expect(other.getByRole("heading", { name: "Plan not found" })).toBeVisible();
  await expect(other.getByText("CMPS 240")).toHaveCount(0);
  await expect(total(other)).toHaveCount(0);

  await other.goto("/planner/not-a-plan-id");
  await expect(other.getByRole("heading", { name: "Plan not found" })).toBeVisible();
});

test("there is one planner: /calendar leads to it and the menu has no separate Calendar", async ({ page }) => {
  await logIn(page, students.omar);
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/planner$/);

  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("complementary", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Plan your semester" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Calendar", exact: true })).toHaveCount(0);
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the planner fits without sideways scrolling, and a day's Add opens a new item", async ({ page }) => {
    await logIn(page, students.phone);
    await createPlan(page, "Spring 2027");
    await addCourse(page, "CMPS 240", "CMPS 240");

    await expect(total(page)).toHaveText("3 credits · 1 course");
    await openDialog(page, () => page.getByRole("button", { name: /^Add an item on / }).first().click());
    await expect(dialog(page).getByLabel("Title")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toBeHidden();
  });
});

test("the planner can be used with the keyboard alone", async ({ page }) => {
  await logIn(page, students.keys);
  await page.goto("/planner");

  // Term, then the calendar link, then Create plan.
  const term = page.getByLabel("Term");
  await expect(term).toBeVisible();
  await term.focus();
  await expect(term).toBeFocused();
  // Spring 2027 is the term with an imported schedule in the mock.
  await term.selectOption("Spring 2027");
  await term.press("Tab");
  await expect(page.getByRole("link", { name: "official AUB academic calendar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create plan" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(PLAN_URL, { timeout: 20_000 });

  await page.getByLabel("Search the catalogue").focus();
  await page.keyboard.type("MATH");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?q=MATH$/);

  await page.getByRole("button", { name: "Add MATH 201 to this plan" }).focus();
  await page.keyboard.press("Enter");
  await expect(planned(page, "MATH 201")).toBeVisible();

  // MATH 202 has sections: choose one from the picker.
  await page.getByRole("button", { name: "Add MATH 202 to this plan" }).focus();
  await page.keyboard.press("Enter");
  const picker = await sectionPicker(page, "MATH 202");
  await picker.getByLabel(/^Section 2 · CRN 90012 · Lecture/).focus();
  await page.keyboard.press("Space");
  await picker.getByRole("button", { name: "Use this section" }).focus();
  await page.keyboard.press("Enter");
  // The picker's own label has the same text, so wait for the saved page first.
  await expect(page).toHaveURL(/\?done=[0-9a-f-]{36}&what=picked#course-/, { timeout: 20_000 });
  await expect(planned(page, "MATH 202").getByText("Section 2 · CRN 90012")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Move MATH 202 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article").first()).toHaveAccessibleName(/^MATH 202 /);
  await expect(total(page)).toHaveText("6 credits · 2 courses");

  // A day's + opens a new item; Enter in the title saves it as an all-day item.
  await openDialog(page, async () => {
    await page.getByRole("button", { name: /^Add an item on / }).first().focus();
    await page.keyboard.press("Enter");
  });
  await expect(dialog(page).getByLabel("Title")).toBeFocused();
  await page.keyboard.type("Read chapter 3");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeHidden({ timeout: 15_000 });
  await expect(itemOnCalendar(page, "Read chapter 3")).toHaveAccessibleName(/All day, your item$/);
});

// SP3-50 (SCRUM-67): conflict warnings, checked against what is saved.

test("an overlap is flagged until it is actually fixed, and stays fixed after a reload", async ({ page, browser }) => {
  await logIn(page, students.conflicts);
  await createPlan(page, "Spring 2027");
  await expect(status(page)).toHaveText("No courses to check yet");
  // Its only section meets Tue and Thu 14:00-15:15.
  await addCourse(page, "CMPS 240", "CMPS 240");
  await expect(status(page)).toHaveText("No conflicts");
  await openWeek(page, "2027-02-16");

  await test.step("an item clicked onto the calendar during a class is flagged, naming both, the day and the times", async () => {
    await clickSquare(page, "2027-02-16", "13:00");
    await expect(dialog(page).getByRole("heading", { name: "New item · Tue, 16 Feb 2027" })).toBeVisible();
    await expect(dialog(page).getByLabel("Starts")).toHaveValue("13:00");
    await expect(dialog(page).getByLabel("Ends")).toHaveValue("14:00");
    await saveItem(page, { title: "Office hours", start: "14:30", end: "15:30" });

    await expect(status(page)).toHaveText("1 conflict found");
    const line = conflictLine(page, "overlap on Tuesday 14:30–15:15 (Beirut time), only on Tue, 16 Feb 2027.");
    await expect(line).toContainText("CMPS 240");
    await expect(line).toContainText("Office hours");
    await expect(itemOnCalendar(page, "Office hours")).toHaveAccessibleName(/overlaps something else$/);
    await expect(page.getByRole("link", { name: "CMPS 240, Tue, 16 Feb 2027, 14:00–15:15, class, overlaps something else" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CMPS 240, Thu, 18 Feb 2027, 14:00–15:15, class" })).toBeVisible();

    await line.getByRole("link", { name: "CMPS 240" }).click();
    await expect(page).toHaveURL(/#meeting-[0-9a-f-]{36}$/);
  });

  await test.step("starting exactly when the class ends clears it, and it stays cleared after a reload", async () => {
    await itemOnCalendar(page, "Office hours").click();
    await saveItem(page, { start: "15:15", end: "16:00" }, "Save changes");
    await expect(status(page)).toHaveText("No conflicts");
    await page.reload();
    await expect(status(page)).toHaveText("No conflicts");
    await expect(itemOnCalendar(page, "Office hours")).toHaveAccessibleName("Edit Office hours, Tue, 16 Feb 2027, 15:15–16:00, your item");
  });

  await test.step("removing the class clears an overlap too", async () => {
    await itemOnCalendar(page, "Office hours").click();
    await saveItem(page, { start: "15:00", end: "16:00" }, "Save changes");
    await expect(status(page)).toHaveText("1 conflict found");
    await page.getByRole("button", { name: "Remove CMPS 240 from this plan" }).click();
    await expect(status(page)).toHaveText("No conflicts");
    await page.reload();
    await expect(status(page)).toHaveText("No conflicts");
  });

  await test.step("a second student sees none of it", async () => {
    const planUrl = new URL(page.url()).pathname;
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
  // Summer 2027 has no imported schedule, so its courses have no times.
  await createPlan(page, "Summer 2027");
  await addCourse(page, "CMPS 240", "CMPS 240");

  await expect(status(page)).toHaveText("No conflicts so far, but 1 course has no times");
  await expect(page.getByText(/^No conflicts$/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "CMPS 240", exact: true })).toHaveAttribute("href", /^#course-/);
  await expect(planned(page, "CMPS 240").getByText("No times yet")).toBeVisible();
  await expect(page.getByText(/Add a meeting/)).toHaveCount(0);
});

// The calendar: classes, own items and events the student is going to.

const calendarHeading = (page: Page) => page.getByRole("heading", { level: 2, name: /^\d.*20\d\d$/ });
const eventRow = (page: Page, title: string) => page.getByRole("region", { name: "Events" }).getByRole("listitem").filter({ hasText: title });
const onCalendar = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(`^${title}, `) });

test("the calendar shows classes, own items and events you're going to, and flags any overlap", async ({ page }) => {
  await logIn(page, students.calendar);
  await createPlan(page, "Spring 2027");
  // Section 2 meets Tue and Thu 11:00-12:15, with its recitation on Wed 16:00-16:50.
  await addCourse(page, "MATH 202", "MATH 202");
  const picker = await sectionPicker(page, "MATH 202");
  await picker.getByLabel(/^Section 2 · CRN 90012 · Lecture/).check();
  await picker.getByRole("button", { name: "Use this section" }).click();
  // The picker's own label has the same text, so wait for the saved page first.
  await expect(page).toHaveURL(/\?done=[0-9a-f-]{36}&what=picked#course-/, { timeout: 20_000 });
  await expect(planned(page, "MATH 202").getByText("Section 2 · CRN 90012")).toBeVisible({ timeout: 20_000 });

  await test.step("a week is shown with its dates, and saved events wait until marked as going", async () => {
    await openWeek(page, "2027-02-17");
    await expect(calendarHeading(page)).toHaveText("15–21 Feb 2027");
    await expect(page.getByText("Week 6 of classes")).toBeVisible();
    await expect(page.getByRole("link", { name: "MATH 202, Tue, 16 Feb 2027, 11:00–12:15, class" })).toHaveAttribute("href", /^#meeting-/);
    await expect(eventRow(page, "Robotics club talk")).toContainText("Tue, 16 Feb 2027 · 11:30–12:30 · Bechtel 101");
    await expect(onCalendar(page, "Robotics club talk")).toHaveCount(0);
    await expect(status(page)).toHaveText("No conflicts");
  });

  await test.step("going to an event puts it on the calendar and flags its overlap with a class", async () => {
    await eventRow(page, "Robotics club talk").getByRole("button", { name: "Going to Robotics club talk" }).click();
    await expect(status(page)).toHaveText("1 conflict found");
    await expect(
      conflictLine(page, "MATH 202 and Robotics club talk overlap on Tuesday 11:30–12:15 (Beirut time), only on Tue, 16 Feb 2027."),
    ).toBeVisible();
    await expect(onCalendar(page, "Robotics club talk")).toHaveAccessibleName(/, event, overlaps something else$/);
  });

  await test.step("an item clicked onto the calendar, linked to its course, is checked against events", async () => {
    await eventRow(page, "Career fair").getByRole("button", { name: "Going to Career fair" }).click();
    await expect(status(page)).toHaveText("1 conflict found");
    await clickSquare(page, "2027-02-17", "14:00");
    await saveItem(page, { title: "MATH 202 midterm", end: "16:00", course: "MATH 202" });
    await expect(itemOnCalendar(page, "MATH 202 midterm")).toHaveAccessibleName(/^Edit MATH 202 midterm, Wed, 17 Feb 2027, 14:00–16:00, your item/);
    await expect(status(page)).toHaveText("2 conflicts found");
    await expect(conflictLine(page, "MATH 202 midterm and Career fair overlap on Wednesday 14:00–15:00")).toBeVisible();
  });

  await test.step("moving the item clears its overlap, and an all-day item is never checked", async () => {
    await itemOnCalendar(page, "MATH 202 midterm").click();
    await expect(dialog(page).getByLabel("Course")).toHaveValue(/[0-9a-f-]{36}/);
    await saveItem(page, { start: "15:00", end: "16:00" }, "Save changes");
    await expect(status(page)).toHaveText("1 conflict found");

    await square(page, "2027-02-19", "").click();
    await saveItem(page, { title: "Essay due" });
    await expect(itemOnCalendar(page, "Essay due")).toHaveAccessibleName("Edit Essay due, Fri, 19 Feb 2027, All day, your item");
    await expect(status(page)).toHaveText("1 conflict found");
  });

  await test.step("a date too far from the term is refused in the dialog", async () => {
    await openDialog(page, () => page.getByRole("button", { name: "Add an item on Fri, 19 Feb 2027" }).click());
    await dialog(page).getByLabel("Title").fill("Summer trip");
    await dialog(page).getByLabel("Date").fill("2027-07-01");
    await dialog(page).getByRole("button", { name: "Save item" }).click();
    await expect(dialog(page).getByText("Pick a date between Mon, 14 Dec 2026 and Thu, 27 May 2027.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toBeHidden();
  });

  await test.step("not going removes the event's overlap, and everything survives a reload", async () => {
    await eventRow(page, "Robotics club talk").getByRole("button", { name: "Not going to Robotics club talk" }).click();
    await expect(status(page)).toHaveText("No conflicts");
    await page.reload();
    await expect(status(page)).toHaveText("No conflicts");
    await expect(onCalendar(page, "Career fair")).toBeVisible();
    await expect(onCalendar(page, "Robotics club talk")).toHaveCount(0);
    await expect(itemOnCalendar(page, "MATH 202 midterm")).toHaveAccessibleName(/, 15:00–16:00, your item$/);
  });

  await test.step("an item can be deleted from its dialog", async () => {
    await itemOnCalendar(page, "Essay due").click();
    await dialog(page).getByRole("button", { name: "Delete item" }).click();
    await expect(dialog(page)).toBeHidden({ timeout: 15_000 });
    await expect(itemOnCalendar(page, "Essay due")).toHaveCount(0);
  });

  await test.step("the week links move through the term", async () => {
    await page.getByRole("link", { name: /^Next week/ }).click();
    await expect(page).toHaveURL(/\?week=2027-02-22#calendar$/);
    await expect(calendarHeading(page)).toHaveText("22–28 Feb 2027");
    await expect(page.getByText("Week 7 of classes")).toBeVisible();
  });
});

// SCRUM-243: class times from sections of AUB's imported schedule. The mock's
// sections are synthetic (mock-planner.mjs), not AUB's schedule.
test("a linked plan fills class times from the chosen section, and never asks for typed times", async ({ page }) => {
  await logIn(page, students.sections);
  await createPlan(page, "Spring 2027");
  const picker = (code: string) => page.getByRole("region", { name: `Choose a section of ${code}` });

  await test.step("the new plan links itself to the imported Spring 2026-2027 schedule", async () => {
    await expect(page.getByText(/^Times from AUB's Spring 2026-2027 schedule via Resis, imported 8 Nov 2026\./)).toBeVisible();
    await expect(page.getByRole("link", { name: "Resis" })).toHaveAttribute("href", "https://resis.org/");
  });

  await test.step("search says which courses the imported schedule has", async () => {
    await search(page, "MATH");
    const results = page.getByRole("list", { name: "Courses matching MATH" });
    await expect(results.getByRole("listitem").filter({ hasText: "MATH 202" })).toContainText("3 sections");
    await expect(results.getByRole("listitem").filter({ hasText: "MATH 201" })).toContainText("Not in Spring 2026-2027");
  });

  await test.step("adding an offered course opens its section picker, with the linked recitation offered", async () => {
    await page.getByRole("button", { name: "Add MATH 202 to this plan" }).click();
    await expect(page).toHaveURL(/\?sections=[0-9a-f-]{36}#course-/, { timeout: 20_000 });
    await expect(picker("MATH 202")).toBeVisible();
    await expect(picker("MATH 202").getByText("3 sections in AUB's Spring 2026-2027 schedule")).toBeVisible();
    await sectionPicker(page, "MATH 202");
    await picker("MATH 202").getByLabel(/^Section 2 · CRN 90012 · Lecture/).check();
    const linked = picker("MATH 202").getByRole("group", { name: "Section 2's recitation, CRN 90013, is linked to it. Add it too?" });
    await expect(linked.getByRole("checkbox")).toBeChecked();
    await picker("MATH 202").getByRole("button", { name: "Use this section" }).click();
  });

  await test.step("its days and times fill in from the schedule", async () => {
    await expect(page).toHaveURL(/\?done=[0-9a-f-]{36}&what=picked#course-/, { timeout: 20_000 });
    const course = planned(page, "MATH 202");
    await expect(course.getByText("Section saved.")).toBeVisible();
    await expect(course.getByText("Section 2 · CRN 90012")).toBeVisible();
    await expect(course.getByText("Section E1 · CRN 90013")).toBeVisible();
    await expect(course.getByText("Tue 11:00–12:15")).toBeVisible();
    await expect(course.getByText("Wed 16:00–16:50")).toBeVisible();
  });

  await test.step("a course with one section gets it straight away", async () => {
    await search(page, "CMPS 240");
    await page.getByRole("button", { name: "Add CMPS 240 to this plan" }).click();
    await expect(planned(page, "CMPS 240").getByText("Its only section was chosen: Section 1 (CRN 90021).")).toBeVisible();
    await expect(planned(page, "CMPS 240").getByText("Thu 14:00–15:15")).toBeVisible();
  });

  await test.step("a lecture with a linked lab offers the lab", async () => {
    await search(page, "CMPS 241");
    await page.getByRole("button", { name: "Add CMPS 241 to this plan" }).click();
    await sectionPicker(page, "CMPS 241");
    await picker("CMPS 241").getByLabel(/^Section L1 · CRN 90031 · Lecture/).check();
    const lab = picker("CMPS 241").getByRole("group", { name: "Section L1's lab, CRN 90032, is linked to it. Add it too?" });
    await expect(lab.getByRole("checkbox")).toBeChecked();
    await picker("CMPS 241").getByRole("button", { name: "Use this section" }).click();
    await expect(page).toHaveURL(/\?done=[0-9a-f-]{36}&what=picked#course-/, { timeout: 20_000 });
    const course = planned(page, "CMPS 241");
    await expect(course.getByText("Section B1 · CRN 90032")).toBeVisible({ timeout: 20_000 });
    await expect(course.getByText("Fri 14:00–16:00")).toBeVisible();
    await expect(page.getByText(/Add a meeting|typed times/i)).toHaveCount(0);
  });

  await test.step("when a newer import moves a chosen section, the plan says so and updates on request", async () => {
    const course = planned(page, "CMPS 240");
    await expect(course.getByRole("note")).toHaveText(/Section 1's times changed in AUB's schedule \(imported 8 Nov 2026\)\./);
    await course.getByRole("button", { name: "Update times of CMPS 240 from AUB's schedule" }).click();
    await expect(course.getByText("Times updated.")).toBeVisible();
    await expect(course.getByRole("note")).toHaveCount(0);
  });

  await test.step("a course the schedule doesn't have is added without times, and counted as unknown", async () => {
    await addCourse(page, "MATH 201", "MATH 201");
    await expect(planned(page, "MATH 201").getByText("Not in AUB's Spring 2026-2027 schedule")).toBeVisible();
    await expect(status(page)).toHaveText("No conflicts so far, but 1 course has no times");
  });

  await test.step("a section whose times aren't announced leaves the course unknown, never clear", async () => {
    await search(page, "CMPS 101");
    await page.getByRole("button", { name: "Add CMPS 101 to this plan" }).click();
    const course = planned(page, "CMPS 101");
    await expect(course.getByText("Times to be announced")).toBeVisible({ timeout: 20_000 });
    await expect(status(page)).toHaveText("No conflicts so far, but 2 courses have no times");
    await expect(page.getByText(/^No times yet: MATH 201, CMPS 101\.$/)).toBeVisible();
  });

  await test.step("the picker works at phone width without sideways scrolling", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await planned(page, "MATH 202").getByRole("link", { name: "Change section of MATH 202" }).click();
    await expect(picker("MATH 202")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await picker("MATH 202").getByRole("link", { name: "Cancel" }).click();
    await expect(picker("MATH 202")).toHaveCount(0);
  });
});

import { expect, test, type Page } from "@playwright/test";

// SCRUM-244/245: /calendar against the mocked Supabase. The calendar's
// students and their synthetic plan, sections and events are in
// tests/e2e/mock-calendar.mjs; dates are in the plan's Spring 2027 term.
const students = {
  lina: "calendar-lina@mail.aub.edu",
  going: "calendar-going@mail.aub.edu",
  omar: "calendar-omar@mail.aub.edu",
};
// calendar-going's plan id in mock-calendar.mjs.
const GOING_PLAN = "00000000-0000-4000-9000-000000000402";

const TUESDAY = "/calendar?view=today&date=2027-02-16";
const WEEK = "/calendar?view=week&date=2027-02-16";

test.describe.configure({ timeout: 90_000 });

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // The first visit to /home compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

/** The overlap panel's headline. */
const overlapHeadline = (page: Page) => page.getByRole("heading", { level: 3 }).filter({ hasText: /overlap/ });
const entry = (page: Page, text: string | RegExp) => page.getByRole("main").getByRole("listitem").filter({ hasText: text });

test("a going event during a class is an overlap on Today and This Week, until the student isn't going", async ({ page }) => {
  await logIn(page, students.going);

  await test.step("Today names both, the overlapping time, and marks both entries", async () => {
    await page.goto(TUESDAY);
    await expect(page.getByRole("heading", { level: 2, name: "Tue, 16 Feb 2027" })).toBeVisible();
    await expect(overlapHeadline(page)).toHaveText("1 overlap this day");
    await expect(page.getByRole("list", { name: "Overlaps" }).getByRole("listitem")).toHaveText(
      "MATH 202 (class) and Robotics club talk (event you're going to) overlap on Tue, 16 Feb 2027, 11:30–12:15 (Beirut time).",
    );
    await expect(entry(page, /11:00–12:15\s+MATH 202/)).toContainText("Class · Section 2 · Lecture · Test Hall 201");
    await expect(entry(page, /11:00–12:15\s+MATH 202/)).toContainText("Overlaps something else");
    await expect(entry(page, /11:30–12:30\s+Robotics club talk/)).toContainText("Event (going)");
    await expect(page.getByRole("link", { name: "Robotics club talk" }).first()).toHaveAttribute("href", /\/events\//);
  });

  await test.step("This Week shows the same overlap", async () => {
    await page.goto(WEEK);
    await expect(page.getByRole("heading", { level: 2, name: "15–21 Feb 2027" })).toBeVisible();
    await expect(overlapHeadline(page)).toHaveText("1 overlap this week");
  });

  await test.step("not going, on the plan page, clears it after a reload", async () => {
    await page.goto(`/planner/${GOING_PLAN}`);
    await page.getByRole("button", { name: "Not going to Robotics club talk" }).click();
    await expect(page.getByRole("button", { name: "Going to Robotics club talk" })).toBeVisible();
    await page.goto(WEEK);
    await page.reload();
    await expect(overlapHeadline(page)).toHaveText("No overlaps this week");
    const talk = page.getByRole("list", { name: "Tue, 16 Feb 2027", exact: true }).getByRole("listitem").filter({ hasText: /^.*Robotics club talk · Event \(saved\)/ });
    await expect(talk).toContainText("Clashes with MATH 202");
  });
});

test("a saved event the student isn't going to gets a quiet note, not a warning", async ({ page }) => {
  await logIn(page, students.lina);
  await page.goto("/calendar?view=today&date=2027-02-18");
  await expect(overlapHeadline(page)).toHaveText("No overlaps this day");
  const fair = entry(page, "Career fair");
  await expect(fair).toContainText("Event (saved)");
  await expect(fair).toContainText("Clashes with MATH 202");
  await expect(fair).not.toContainText("Overlaps something else");
});

test("a reminder shows at its time, and a cancelled event shows as cancelled with none", async ({ page }) => {
  await logIn(page, students.lina);
  await page.goto(TUESDAY);
  await expect(entry(page, "Reminder: Robotics club talk at 11:30")).toContainText("10:30");
  await expect(entry(page, "Reminder: Robotics club talk at 11:30")).toContainText("Reminder");

  await page.goto("/calendar?view=today&date=2027-02-17");
  await expect(entry(page, "Spring gala")).toContainText("Event (cancelled)");
  await expect(page.getByText("Reminder: Spring gala", { exact: false })).toHaveCount(0);
  await expect(entry(page, "Office hours")).toContainText("Your item");
  await expect(entry(page, /16:00–16:50\s+MATH 202/)).toContainText("Section E1 · Recitation");
});

test("weeks move, the header links to the calendar, and a week no plan covers says so", async ({ page }) => {
  await logIn(page, students.lina);

  await test.step("the header's menu has Calendar", async () => {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  });

  await test.step("This Week runs Monday to Sunday and moves a week at a time", async () => {
    await page.goto(WEEK);
    const days = page.getByRole("list", { name: "Your week, 15–21 Feb 2027" }).getByRole("heading", { level: 3 });
    await expect(days).toHaveText(["Mon, 15 Feb 2027", "Tue, 16 Feb 2027", "Wed, 17 Feb 2027", "Thu, 18 Feb 2027", "Fri, 19 Feb 2027", "Sat, 20 Feb 2027", "Sun, 21 Feb 2027"]);
    await page.getByRole("link", { name: "Next week, 22–28 Feb 2027" }).click();
    await expect(page).toHaveURL(/view=week&date=2027-02-22$/);
    await expect(page.getByRole("heading", { level: 2, name: "22–28 Feb 2027" })).toBeVisible();
    await page.getByRole("link", { name: "Previous week, 15–21 Feb 2027" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "15–21 Feb 2027" })).toBeVisible();
    // Day keeps the week's date: here its Monday.
    await page.getByRole("navigation", { name: "Calendar view" }).getByRole("link", { name: "Day" }).click();
    await expect(page).toHaveURL(/view=today&date=2027-02-15$/);
  });

  await test.step("a week after the plan's term shows no classes and points to the planner", async () => {
    await page.goto("/calendar?view=week&date=2027-06-07");
    await expect(page.getByText("No semester plan covers this week.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan your classes" })).toHaveAttribute("href", "/planner");
    await expect(page.getByText("Nothing on your calendar this week.")).toBeVisible();
  });
});

test("another student sees none of it", async ({ page }) => {
  await logIn(page, students.omar);
  await page.goto(WEEK);
  await expect(page.getByText("You have no semester plans or saved events yet.")).toBeVisible();
  await expect(overlapHeadline(page)).toHaveText("No overlaps this week");
  for (const text of ["MATH 202", "Robotics club talk", "Career fair", "Office hours"]) {
    await expect(page.getByRole("main").getByText(text)).toHaveCount(0);
  }
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("This Week is a day-by-day list without sideways scrolling", async ({ page }) => {
    await logIn(page, students.lina);
    await page.goto(WEEK);
    const list = page.getByRole("list", { name: "Your week, 15–21 Feb 2027" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("link", { name: "Robotics club talk", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the calendar can be used with the keyboard alone", async ({ page }) => {
  await logIn(page, students.lina);
  await page.goto(TUESDAY);

  /** Presses Tab until the focused element has this accessible name. */
  async function tabTo(name: string) {
    for (let presses = 0; presses < 60; presses += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        return element?.getAttribute("aria-label") ?? element?.textContent?.trim() ?? "";
      });
      if (focused === name) return;
    }
    throw new Error(`Tab never reached "${name}"`);
  }

  await tabTo("Next day, Wed, 17 Feb 2027");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=today&date=2027-02-17$/);
  await expect(page.getByRole("heading", { level: 2, name: "Wed, 17 Feb 2027" })).toBeVisible();

  await tabTo("Week");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=week&date=2027-02-17$/);

  await tabTo("Office hours");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/planner\/[0-9a-f-]{36}#item-/);
});

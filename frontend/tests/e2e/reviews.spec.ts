import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/courses/CMPS-240");
}
async function fill(page: Page, body = "Clear examples and a useful project.") {
  for (const [label, value] of [["Difficulty", "2"], ["Workload", "3"], ["Usefulness", "5"], ["Overall experience", "4"]]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
  }
  await page.getByLabel("Semester taken", { exact: true }).fill("Fall 2026");
  await page.getByLabel("Your written review", { exact: true }).fill(body);
  await page.getByLabel("I completed this course", { exact: true }).check();
}
const feedback = (page: Page) => page.getByLabel("Review feedback", { exact: true });

test("a student creates, reloads, edits and explicitly deletes their own review", async ({ page }) => {
  await login(page, "reviews-journey@mail.aub.edu");
  await fill(page);
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  await expect(page.getByRole("heading", { name: "Edit your review", exact: true })).toBeVisible();
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("I completed this course", { exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("Clear examples and a useful project.");
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("2");
  await page.getByLabel("Your written review", { exact: true }).fill("Updated experience with the final project.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  await page.reload();
  await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("Updated experience with the final project.");
  await page.getByRole("button", { name: "Delete my review", exact: true }).click();
  await expect(page.getByText("Delete your review? This removes your ratings and written review.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete my review", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(feedback(page)).toContainText("deleted");
  await expect(page.getByRole("button", { name: "Post review", exact: true })).toBeVisible();
  await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("button", { name: "Post review", exact: true })).toBeVisible();
});

test("validation and community restrictions preserve the student's draft", async ({ page }) => {
  await login(page, "reviews-validation@mail.aub.edu");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("highlighted fields");
  await expect(page.getByText("Confirm that you completed this course.", { exact: true })).toBeVisible();
  for (const body of ["You are an idiot.", "انت غبي", "https://a.test https://b.test https://c.test https://d.test"]) {
    await fill(page, body);
    await page.getByRole("button", { name: "Post review", exact: true }).click();
    await expect(feedback(page)).toContainText(/guidelines|too many links/);
    await expect(feedback(page)).not.toContainText("idiot");
    await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue(body);
  }
  await fill(page, "Thoughtful labs and practical examples.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
});

test("tampering with review identity cannot edit another student's review", async ({ page, browser }) => {
  await login(page, "reviews-owner@mail.aub.edu");
  await fill(page, "The original owner's review.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  const id = await page.locator('input[name="reviewId"]').inputValue();
  const updatedAt = await page.locator('input[name="updatedAt"]').inputValue();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await login(other, "reviews-other@mail.aub.edu");
    await expect(other.getByLabel("Your written review", { exact: true })).toHaveValue("");
    await expect(other.getByRole("button", { name: "Delete my review", exact: true })).toHaveCount(0);
    await fill(other, "An attempted unauthorized edit.");
    await other.locator('input[name="reviewId"]').evaluate((element, value) => { (element as HTMLInputElement).value = value; }, id);
    await other.locator('input[name="updatedAt"]').evaluate((element, value) => { (element as HTMLInputElement).value = value; }, updatedAt);
    await other.getByRole("button", { name: "Post review", exact: true }).click();
    await expect(feedback(other)).toContainText("changed or is no longer available");
    await page.reload();
    await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("The original owner's review.");
  } finally { await otherContext.close(); }
});

test("a student can report another student's published course review", async ({ page, browser }) => {
  await login(page, "reviews-report-owner@mail.aub.edu");
  await fill(page, "A review that another student can report.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  try {
    await login(reporter, "reviews-other@mail.aub.edu");
    const card = reporter.getByRole("article").filter({ hasText: "A review that another student can report." });
    await expect(card).toBeVisible();
    const reason = card.getByRole("combobox", { name: "Reason" });
    await card.getByRole("button", { name: "Report review", exact: true }).click();
    await expect(reason).toBeVisible();
    await reason.selectOption("misleading");
    await card.getByLabel("Details (optional)", { exact: true }).fill("The course information is inaccurate.");
    await card.getByRole("button", { name: "Submit report", exact: true }).click();
    await expect(card.getByRole("status")).toContainText("Report submitted");
  } finally {
    await reporterContext.close();
  }
});

test("an already-open blank form cannot overwrite a review created in another tab", async ({ page, context }) => {
  await login(page, "reviews-duplicate@mail.aub.edu");
  const stale = await context.newPage();
  await stale.goto("/courses/CMPS-240");
  await fill(stale, "A distinct draft from the older tab.");
  await fill(page, "First submission from the current tab.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  await stale.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(stale)).toContainText("already have a review");
  await expect(stale.getByLabel("Your written review", { exact: true })).toHaveValue("A distinct draft from the older tab.");
  await stale.close();
});

test("a stale edit cannot replace newer changes", async ({ page, context }) => {
  await login(page, "reviews-stale@mail.aub.edu");
  await fill(page, "The initial version.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  const stale = await context.newPage();
  await stale.goto("/courses/CMPS-240");
  await stale.getByLabel("Your written review", { exact: true }).fill("Older tab edits.");
  await page.getByLabel("Your written review", { exact: true }).fill("Newer saved version.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  await stale.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(feedback(stale)).toContainText("changed or is no longer available");
  await stale.reload();
  await expect(stale.getByLabel("Your written review", { exact: true })).toHaveValue("Newer saved version.");
  await stale.close();
});

test("pending submissions disable edits and the form fits a phone", async ({ page }) => {
  await login(page, "reviews-pending@mail.aub.edu");
  await page.setViewportSize({ width: 375, height: 812 });
  await fill(page, "A mobile review with clear feedback.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Your written review", { exact: true })).toBeDisabled();
  await expect(feedback(page)).toContainText("saved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("I completed this course", { exact: true })).toBeChecked();
  await page.screenshot({ path: "/tmp/campusconnect-review-mobile.png", fullPage: true });
});

test("load failures do not show an unsafe blank create form", async ({ page }) => {
  await login(page, "reviews-load-failure@mail.aub.edu");
  await expect(page.getByRole("region", { name: "Ratings and reviews" })).toContainText("couldn’t be loaded");
  await expect(page.getByRole("button", { name: "Post review", exact: true })).toHaveCount(0);
});

test("database and network failures keep the draft usable", async ({ page }) => {
  await login(page, "reviews-save-failure@mail.aub.edu");
  await fill(page, "My draft must stay after a database error.");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("couldn't save");
  await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("My draft must stay after a database error.");
  await page.context().clearCookies();
  await login(page, "reviews-network@mail.aub.edu");
  await fill(page, "My draft must stay after a network error.");
  await page.route("**/courses/CMPS-240", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("couldn't be completed");
  await expect(page.getByLabel("Your written review", { exact: true })).toHaveValue("My draft must stay after a network error.");
  await page.unroute("**/courses/CMPS-240");
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
});

test("a session that expires after loading cannot submit a review", async ({ page, context }) => {
  await login(page, "reviews-expired@mail.aub.edu");
  await fill(page);
  await context.clearCookies();
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
});

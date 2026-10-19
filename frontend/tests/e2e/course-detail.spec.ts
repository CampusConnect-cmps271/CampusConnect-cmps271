import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "course-detail@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("direct course links require login and retain the requested destination", async ({ page }) => {
  await page.goto("/courses/CMPS-240?q=CMPS&page=2");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/courses/CMPS-240?q=CMPS&page=2");
});

test("open a course, follow prerequisites, and return to the original catalogue search", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS&department=Computer+Science&page=2");
  await page.getByRole("link", { name: "View course CMPS 240", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Operating Systems");
  await expect(page).toHaveTitle("CMPS 240 · CampusConnect");
  await expect(page.locator("dl")).toContainText("3 credits");
  await expect(page.locator("dl")).toContainText("Computer Science");
  await expect(page.getByRole("region", { name: "Course description" })).toContainText("A synthetic description about operating systems for browser tests.");
  const prerequisites = page.getByRole("region", { name: "Prerequisites" });
  await expect(prerequisites.locator("p").first()).toHaveText("Prerequisite: CMPS101 or CMPS 102. Instructor consent may also be required.");
  await expect(prerequisites.getByRole("link", { name: "CMPS101", exact: true })).toHaveAttribute("href", /\/courses\/CMPS-101\?/);
  await expect(page.getByRole("region", { name: "Ratings and reviews" })).toContainText("Write your review");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Operating Systems");
  await prerequisites.getByRole("link", { name: "CMPS101", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Computing elective 1");
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  const url = new URL(page.url());
  expect(Object.fromEntries(url.searchParams)).toEqual({ q: "CMPS", department: "Computer Science", page: "2" });
  await expect(page.locator("article")).toHaveCount(6);
});

test("unimported prerequisites remain plain text and shorthand references link correctly", async ({ page }) => {
  await login(page);
  await page.goto("/courses/CMPS-241");
  const prerequisites = page.getByRole("region", { name: "Prerequisites" });
  await expect(prerequisites.locator("p").first()).toHaveText("Prerequisite: CMPS 101 and CHEM 999, or consent of instructor.");
  await expect(prerequisites.getByRole("link", { name: "CMPS 101", exact: true })).toBeVisible();
  await expect(prerequisites.getByRole("link", { name: "CHEM 999", exact: true })).toHaveCount(0);
  await expect(prerequisites).toContainText("Some referenced courses are not available");
  await page.goto("/courses/CMPS-261");
  await expect(prerequisites.getByRole("link", { name: "102", exact: true })).toHaveAttribute("href", "/courses/CMPS-102");
  await expect(prerequisites.getByRole("link", { name: "103", exact: true })).toHaveAttribute("href", "/courses/CMPS-103");
  await expect(prerequisites.locator("p").first()).toHaveText("Prerequisites: CMPS 101, 102 or 103.");
});

test("empty prerequisites and unavailable course codes have clear states", async ({ page }) => {
  await login(page);
  await page.goto("/courses/math201");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calculus III");
  await expect(page.getByRole("region", { name: "Prerequisites" })).toContainText("No prerequisites are listed");
  await page.locator("dl").getByRole("link", { name: "Mathematics", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(2);
  for (const code of ["CMPS-999", "invalid-code"]) {
    await page.goto(`/courses/${code}`);
    await expect(page.getByRole("heading", { name: "Course not found", exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Browse courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Course catalogue", exact: true })).toBeVisible();
});

test("a course query failure is retryable without being presented as a missing course", async ({ page }) => {
  await login(page, "courses-unavailable@mail.aub.edu");
  await page.goto("/courses/CMPS-240?q=CMPS&page=2");
  await expect(page.getByRole("alert", { name: "Course couldn’t be loaded" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again", exact: true })).toHaveAttribute("href", "/courses/CMPS-240?q=CMPS&page=2");
  await expect(page.locator("body")).not.toContainText("Synthetic database failure details");
  await expect(page.getByRole("heading", { name: "Course not found", exact: true })).toHaveCount(0);
});

test("prerequisite lookup failures keep the course and its original requirements readable", async ({ page }) => {
  await login(page, "courses-links-unavailable@mail.aub.edu");
  await page.goto("/courses/CMPS-240");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Operating Systems");
  const prerequisites = page.getByRole("region", { name: "Prerequisites" });
  await expect(prerequisites).toContainText("Prerequisite links are temporarily unavailable");
  await expect(prerequisites.locator("p").first()).toHaveText("Prerequisite: CMPS101 or CMPS 102. Instructor consent may also be required.");
  await expect(prerequisites.getByRole("link")).toHaveCount(0);
});

test("the full course description and facts remain readable on mobile", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/courses/CMPS-101");
  const description = page.getByRole("region", { name: "Course description" }).locator("p");
  await expect(description).toContainText("This sentence marks the end of the complete course description.");
  expect(await description.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(await description.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("pre-wrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-course-detail-mobile.png", fullPage: true });
});

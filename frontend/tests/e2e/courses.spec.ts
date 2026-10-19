import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "courses-student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("a signed-out visitor must log in before browsing courses", async ({ page }) => {
  await page.goto("/courses?q=CMPS240");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/courses?q=CMPS240");
});

test("browse by department, paginate and reset the page when searching", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Browse courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Course catalogue", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("32 courses found");
  await expect(page.locator("article")).toHaveCount(24);
  await page.getByLabel("Department", { exact: true }).selectOption("Computer Science");
  await page.getByRole("button", { name: "Search courses" }).click();
  await expect(page.getByRole("status")).toContainText("30 courses found");
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(6);
  await expect(page.getByRole("navigation", { name: "Course pages" })).toContainText("Page 2 of 2");
  expect(new URL(page.url()).searchParams.get("department")).toBe("Computer Science");
  await expect(page.getByRole("heading", { name: "Operating Systems", exact: true })).toBeVisible();
  await page.getByLabel("Course name or code").fill("cmps240");
  await page.getByRole("button", { name: "Search courses" }).click();
  await expect(page.getByRole("status")).toContainText("1 course found");
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.locator("article")).toContainText("CMPS 240");
  await expect(page.locator("article")).toContainText("3 credits");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("32 courses found");
});

test("searches by title, shows no matches and safely handles filter punctuation", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=calculus");
  await expect(page.getByRole("heading", { name: "Mathematics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calculus III", exact: true })).toBeVisible();
  for (const text of ["unknown course xyz", '50%_\\",department.neq.secret)']) {
    await page.getByLabel("Course name or code").fill(text);
    await page.getByRole("button", { name: "Search courses" }).click();
    await expect(page.getByRole("heading", { name: "No courses found" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("0 courses found");
    await expect(page.locator("article")).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Browse all courses" }).click();
  await expect(page.locator("article")).toHaveCount(24);
});

test("course cards reveal the entire description by mouse or keyboard on desktop and mobile", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS101");
  const card = page.locator("article");
  const disclosure = card.locator("details");
  const toggle = card.locator("summary");
  const fullDescription = card.locator("details > p");
  await expect(fullDescription).not.toBeVisible();
  await card.getByText("CMPS 101", { exact: true }).click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(fullDescription).toBeVisible();
  await expect(fullDescription).toContainText("This sentence marks the end of the complete course description.");
  expect(await fullDescription.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await expect(card.getByText("Hide description ↑", { exact: true })).toBeVisible();
  await toggle.focus();
  await toggle.press("Enter");
  await expect(disclosure).not.toHaveAttribute("open");
  await expect(fullDescription).not.toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await toggle.focus();
  await toggle.press("Space");
  await expect(fullDescription).toBeVisible();
  expect(await fullDescription.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("pre-wrap");
  expect(await fullDescription.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-course-expanded-mobile.png", fullPage: true });
});

test("stale pages remain usable and the mobile catalogue does not overflow", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/courses?department=Mathematics&page=9999");
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Course pages" })).toContainText("Page 1 of 1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-courses-mobile.png", fullPage: true });
});

test("database failures show a retry state without exposing internal error text", async ({ page }) => {
  await login(page, "courses-unavailable@mail.aub.edu");
  await page.goto("/courses?q=CMPS");
  await expect(page.getByRole("alert", { name: "Courses couldn’t be loaded" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/courses?q=CMPS");
  await expect(page.locator("body")).not.toContainText("Synthetic database failure details");
  const reload = page.waitForResponse((response) => response.url().endsWith("/courses?q=CMPS") && response.request().isNavigationRequest());
  await page.getByRole("link", { name: "Try again" }).click();
  await reload;
  await expect(page.getByRole("alert", { name: "Courses couldn’t be loaded" })).toBeVisible();
});

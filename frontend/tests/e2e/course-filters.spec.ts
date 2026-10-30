import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "filters-student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const search = (page: Page) => page.getByRole("button", { name: "Search courses", exact: true }).click();
const bounds = ["Minimum credits", "Maximum credits", "Minimum difficulty", "Maximum difficulty", "Minimum workload", "Maximum workload"];

test("all filters apply before pagination and survive refresh and course navigation", async ({ page }) => {
  await login(page);
  await page.goto("/courses");
  await page.getByLabel("Course name or code").fill("CMPS");
  await page.getByLabel("Department", { exact: true }).selectOption("Computer Science");
  for (const [label, value] of bounds.map((label, index) => [label, ["3", "3", "3", "3", "2", "2"][index]])) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await search(page);
  await expect(page.getByRole("status")).toContainText("1 course found");
  // CMPS 127 is beyond the original first page of 24 courses.
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("CMPS 127");
  const query = new URL(page.url()).search;
  await page.reload();
  await expect(page.getByLabel("Minimum credits", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Maximum difficulty", { exact: true })).toHaveValue("3");
  await expect(page.locator("article")).toContainText("CMPS 127");
  await page.getByRole("link", { name: "View course CMPS 127", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Computing elective 27");
  expect(new URL(page.url()).searchParams.get("workloadMax")).toBe("2");
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await expect(page.locator("article")).toContainText("CMPS 127");
  expect(new URL(page.url()).searchParams.get("difficultyMin")).toBe("3");
  // Direct bookmarks get the same result and clamp an out-of-date page.
  await page.goto(`/courses${query}&page=9999`);
  await expect(page.getByRole("navigation", { name: "Course pages" })).toContainText("Page 1 of 1");
  await expect(page.locator("article")).toContainText("CMPS 127");
});

test("credit-only filters include unrated zero-credit and fractional-credit courses", async ({ page }) => {
  await login(page);
  for (const [credits, code] of [["0", "CMPS 126"], ["3.25", "CMPS 125"]]) {
    await page.goto(`/courses?creditsMin=${credits}&creditsMax=${credits}`);
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("article")).toContainText(code);
    await expect(page.locator("article")).toContainText("Not enough reviews yet.");
    await expect(page.getByLabel("Minimum credits", { exact: true })).toHaveValue(credits);
  }
});

test("rating bounds match rounded displayed scores and exclude courses with fewer than three reviews", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS104&difficultyMin=3.3&difficultyMax=3.3&workloadMin=2.7&workloadMax=2.7");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("CMPS 104");
  await expect(page.getByRole("group", { name: "Course ratings for CMPS 104", exact: true }).locator("dd")).toHaveText(["3.3 / 5", "2.7 / 5", "3.7 / 5", "4.0 / 5"]);
  for (const code of ["CMPS101", "CMPS102", "CMPS103"]) {
    await page.goto(`/courses?q=${code}&difficultyMin=1&difficultyMax=5`);
    await expect(page.getByRole("heading", { name: "No courses found", exact: true })).toBeVisible();
  }
});

test("pagination retains range filters and changing a filter resets the page", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS&department=Computer+Science&creditsMin=3&creditsMax=3");
  await expect(page.getByRole("status")).toContainText("28 courses found");
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(4);
  expect(new URL(page.url()).searchParams.get("creditsMin")).toBe("3");
  expect(new URL(page.url()).searchParams.get("creditsMax")).toBe("3");
  await page.getByLabel("Maximum credits", { exact: true }).fill("4");
  await search(page);
  await expect(page.getByRole("navigation", { name: "Course pages" })).toContainText("Page 1 of 2");
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Course pages" })).toContainText("Page 2 of 2");
  await expect(page.getByLabel("Maximum credits", { exact: true })).toHaveValue("3");
});

test("going back shows the URL's filters, not edits that were never searched", async ({ page }) => {
  await login(page);
  await page.goto("/courses?creditsMin=3&creditsMax=3");
  await expect(page.getByRole("status")).toContainText("30 courses found");
  await page.getByLabel("Minimum credits", { exact: true }).fill("1");
  await page.goto("/home");
  await page.goBack();
  await expect(page.getByRole("status")).toContainText("30 courses found");
  await expect(page.getByLabel("Minimum credits", { exact: true })).toHaveValue("3");
});

test("inverted ranges show a correction and Clear removes every applied bound", async ({ page }) => {
  await login(page);
  await page.goto("/courses?creditsMin=6&creditsMax=3&difficultyMin=2&workloadMax=4");
  await expect(page.getByRole("alert", { name: "Check your filter ranges" })).toContainText("minimum cannot be greater than the maximum");
  await expect(page.getByRole("heading", { name: "No courses found", exact: true })).toHaveCount(0);
  await page.getByLabel("Minimum credits", { exact: true }).fill("3");
  await search(page);
  await expect(page.getByRole("alert", { name: "Check your filter ranges" })).toHaveCount(0);
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("32 courses found");
  for (const label of bounds) await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  expect(new URL(page.url()).search).toBe("");
  await page.getByLabel("Maximum credits", { exact: true }).fill("4");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Maximum credits", { exact: true })).toHaveValue("");
});

test("filter-view failures retain the requested URL without silently dropping the filters", async ({ page }) => {
  await login(page, "filters-unavailable@mail.aub.edu");
  await page.goto("/courses?difficultyMax=3.3&creditsMin=0");
  await expect(page.getByRole("alert", { name: "Courses couldn’t be loaded" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again", exact: true })).toHaveAttribute("href", "/courses?creditsMin=0&difficultyMax=3.3");
  await expect(page.locator("article")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Synthetic private filter-view failure");
  // The same account can still browse without a rating predicate.
  await page.goto("/courses?creditsMin=0");
  await expect(page.getByRole("status")).toContainText("32 courses found");
});

test("mobile filter controls and filtered results remain within the viewport", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/courses?q=CMPS104&creditsMin=3&creditsMax=3&difficultyMax=3.3&workloadMin=2.7");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByLabel("Maximum difficulty", { exact: true })).toHaveValue("3.3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-course-filters-mobile.png", fullPage: true });
});

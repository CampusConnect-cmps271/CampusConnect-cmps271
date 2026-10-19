import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "comparison-student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const selection = (page: Page) => page.getByRole("region", { name: "Course comparison selection", exact: true });
const comparisonTable = (page: Page) => page.getByRole("table", { name: "Course requirements and average ratings" });

test("selects across pages and searches, caps at three, compares and restores selection", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS&creditsMin=0");
  await expect(selection(page)).toContainText("0 of 3 selected");
  await expect(page.getByRole("link", { name: "Compare selected courses", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Add CMPS 101 to comparison", exact: true }).click();
  await expect(selection(page)).toContainText("1 of 3 selected");
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await page.getByRole("link", { name: "Add CMPS 127 to comparison", exact: true }).click();
  await expect(selection(page)).toContainText("2 of 3 selected");
  await page.getByLabel("Course name or code").fill("MATH");
  await page.getByRole("button", { name: "Search courses", exact: true }).click();
  await expect(selection(page)).toContainText("CMPS 101");
  await expect(selection(page)).toContainText("CMPS 127");
  await page.getByRole("link", { name: "Add MATH 201 to comparison", exact: true }).click();
  await expect(page.getByRole("button", { name: "Comparison full for MATH 202", exact: true })).toBeDisabled();
  await page.reload();
  await expect(selection(page)).toContainText("3 of 3 selected");
  await page.getByRole("link", { name: "Compare selected courses", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare courses");
  await expect(comparisonTable(page).locator("thead th")).toHaveText(["Course", "CMPS 101Computing elective 1", "CMPS 127Computing elective 27", "MATH 201Calculus III"]);
  await expect(comparisonTable(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Credits", exact: true }) })).toHaveText("Credits333");
  await page.reload();
  await expect(comparisonTable(page)).toBeVisible();
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await expect(page.getByLabel("Course name or code")).toHaveValue("MATH");
  await expect(page.getByLabel("Minimum credits", { exact: true })).toHaveValue("0");
  await expect(selection(page)).toContainText("3 of 3 selected");
  await selection(page).getByRole("link", { name: "Remove CMPS 101 from selection", exact: true }).click();
  await expect(selection(page)).toContainText("2 of 3 selected");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(selection(page)).toContainText("2 of 3 selected");
  await selection(page).getByRole("link", { name: "Clear selection", exact: true }).click();
  await expect(selection(page)).toContainText("0 of 3 selected");
});

test("compares complete prerequisites, departments, fractional and zero credits", async ({ page }) => {
  await login(page);
  await page.goto("/courses/compare?compare=CMPS240&compare=CMPS125&compare=CMPS126");
  const table = comparisonTable(page);
  await expect(table).toContainText("Prerequisite: CMPS101 or CMPS 102. Instructor consent may also be required.");
  await expect(table).toContainText("No prerequisites are listed in the catalogue.");
  await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Credits", exact: true }) })).toHaveText("Credits33.250");
  await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Department", exact: true }) })).toHaveText("DepartmentComputer ScienceComputer ScienceComputer Science");
  await table.getByRole("link", { name: "CMPS 240", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operating Systems", exact: true })).toBeVisible();
  await expect(selection(page)).toContainText("3 of 3 selected");
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await expect(selection(page)).toContainText("3 of 3 selected");
});

test("shows rounded ratings only at three reviews and keeps insufficient counts distinct", async ({ page }) => {
  await login(page);
  await page.goto("/courses/compare?compare=CMPS104&compare=CMPS103&compare=CMPS101");
  const table = comparisonTable(page);
  await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Reviews", exact: true }) }).locator("td")).toHaveText(["3", "2", "0"]);
  for (const [label, value] of [["Difficulty", "3.3 / 5"], ["Workload", "2.7 / 5"], ["Usefulness", "3.7 / 5"], ["Overall experience", "4.0 / 5"]]) {
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) }).locator("td")).toHaveText([value, "Not enough reviews yet.", "Not enough reviews yet."]);
  }
  await selection(page).getByRole("link", { name: "Remove CMPS 101 from selection", exact: true }).click();
  await expect(page).toHaveURL(/\/courses\/compare\?/);
  await expect(table.locator("thead th")).toHaveCount(3);
  await expect(selection(page)).toContainText("2 of 3 selected");
});

test("invalid and missing course selections give an actionable state", async ({ page }) => {
  await login(page);
  for (const query of ["", "?compare=CMPS240", "?compare=cmps240&compare=CMPS-240"]) {
    await page.goto(`/courses/compare${query}`);
    await expect(page.getByText("Choose two or three different courses from the catalogue to begin.", { exact: true })).toBeVisible();
    await expect(comparisonTable(page)).toHaveCount(0);
  }
  for (const query of ["?compare=bad&compare=CMPS240", "?compare=CMPS101&compare=CMPS102&compare=CMPS103&compare=CMPS104"]) {
    await page.goto(`/courses/compare${query}`);
    await expect(page.getByRole("alert", { name: "Invalid comparison selection", exact: true })).toContainText(/invalid|no more than three/);
    await expect(comparisonTable(page)).toHaveCount(0);
  }
  await page.goto("/courses/compare?compare=CMPS240&compare=CHEM999");
  await expect(page.getByRole("alert", { name: "Selected courses unavailable", exact: true })).toContainText("CHEM 999 is not available");
  await expect(comparisonTable(page)).toHaveCount(0);
  await page.goto("/courses/compare?compare=CMPS240&compare=MATH201&compare=CHEM999");
  await expect(page.getByRole("alert", { name: "Selected courses unavailable", exact: true })).toContainText("CHEM 999 is not available");
  await expect(comparisonTable(page).locator("thead th")).toHaveCount(3);
});

test("rating failures preserve course facts and course failures preserve a retry URL", async ({ page }) => {
  await login(page, "ratings-unavailable@mail.aub.edu");
  await page.goto("/courses/compare?compare=CMPS104&compare=MATH201");
  await expect(comparisonTable(page)).toContainText("Ratings temporarily unavailable.");
  await expect(comparisonTable(page)).toContainText("Mathematics");
  await expect(comparisonTable(page)).not.toContainText("Synthetic private ratings failure");
  await page.context().clearCookies();
  await login(page, "comparison-unavailable@mail.aub.edu");
  await page.goto("/courses/compare?compare=CMPS240&compare=MATH201&creditsMin=0");
  await expect(page.getByRole("alert", { name: "Comparison unavailable", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try comparison again", exact: true })).toHaveAttribute("href", "/courses/compare?compare=CMPS+240&compare=MATH+201&creditsMin=0");
  await expect(page.locator("body")).not.toContainText("Synthetic private comparison failure");
  await expect(comparisonTable(page)).toHaveCount(0);
});

test("comparison uses a keyboard-scrollable table without overflowing a phone", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/courses/compare?compare=CMPS104&compare=CMPS105&compare=MATH201");
  const region = page.getByRole("region", { name: "Course comparison table", exact: true });
  await expect(region).toHaveAttribute("tabindex", "0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await region.focus();
  await page.keyboard.press("End");
  await page.screenshot({ path: "/tmp/campusconnect-comparison-mobile.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-comparison-mobile-dark.png", fullPage: true });
});

test("comparison is protected by sign-in", async ({ page }) => {
  await page.goto("/courses/compare?compare=CMPS240&compare=MATH201");
  await expect(page).toHaveURL(/\/login/);
  await expect(comparisonTable(page)).toHaveCount(0);
});

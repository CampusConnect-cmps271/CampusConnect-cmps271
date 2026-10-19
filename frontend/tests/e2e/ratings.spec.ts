import { expect, test, type Locator, type Page } from "@playwright/test";

async function login(page: Page, email = "ratings-reader@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const summary = (page: Page, code: string) => page.getByRole("group", { name: `Course ratings for ${code}`, exact: true });
const feedback = (page: Page) => page.getByLabel("Review feedback", { exact: true });
async function scores(group: Locator, expected: string[]) {
  const labels = ["Difficulty", "Workload", "Usefulness", "Overall experience"];
  await expect(group.locator("dt")).toHaveText(labels);
  await expect(group.locator("dd")).toHaveText(expected.map((value) => `${value} / 5`));
}
async function insufficient(group: Locator, count: number) {
  await expect(group).toContainText(`${count} ${count === 1 ? "review" : "reviews"}`);
  await expect(group).toContainText("Not enough reviews yet.");
  await expect(group.locator("dl")).toHaveCount(0);
}

test("catalogue cards hide averages below three reviews and display all dimensions above the threshold", async ({ page }) => {
  await login(page);
  await page.goto("/courses?q=CMPS");
  for (const [code, count] of [["CMPS 101", 0], ["CMPS 102", 1], ["CMPS 103", 2]] as const) {
    await insufficient(summary(page, code), count);
  }
  await expect(summary(page, "CMPS 104")).toContainText("3 reviews");
  await scores(summary(page, "CMPS 104"), ["3.3", "2.7", "3.7", "4.0"]);
  await expect(summary(page, "CMPS 105")).toContainText("4 reviews");
  await scores(summary(page, "CMPS 105"), ["2.5", "3.5", "3.3", "3.0"]);
  await expect(summary(page, "CMPS 104")).toContainText("harder courses and heavier workloads");
});

test("course detail pages use the same threshold and values as cards", async ({ page }) => {
  await login(page);
  for (const [code, count] of [["CMPS 101", 0], ["CMPS 102", 1], ["CMPS 103", 2]] as const) {
    await page.goto(`/courses/${code.replace(" ", "-")}`);
    await insufficient(summary(page, code), count);
    await expect(page.getByRole("button", { name: "Post review", exact: true })).toBeVisible();
  }
  await page.goto("/courses/CMPS-104");
  await scores(summary(page, "CMPS 104"), ["3.3", "2.7", "3.7", "4.0"]);
  await page.reload();
  await scores(summary(page, "CMPS 104"), ["3.3", "2.7", "3.7", "4.0"]);
});

test("creating, editing and deleting a review refreshes detail and previously visited catalogue summaries", async ({ page }) => {
  await login(page, "ratings-editor@mail.aub.edu");
  await page.goto("/courses?q=CMPS261");
  await insufficient(summary(page, "CMPS 261"), 2);
  await page.getByRole("link", { name: "View course CMPS 261", exact: true }).click();
  await insufficient(summary(page, "CMPS 261"), 2);
  for (const [label, value] of [["Difficulty", "2"], ["Workload", "3"], ["Usefulness", "5"], ["Overall experience", "4"]]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
  }
  await page.getByLabel("Semester taken", { exact: true }).fill("Fall 2026");
  await page.getByLabel("Your written review", { exact: true }).fill("Useful modelling exercises and clear examples.");
  await page.getByLabel("I completed this course", { exact: true }).check();
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(feedback(page)).toContainText("saved");
  await scores(summary(page, "CMPS 261"), ["2.7", "3.0", "3.7", "3.3"]);
  await expect(summary(page, "CMPS 261")).toContainText("3 reviews");
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await scores(summary(page, "CMPS 261"), ["2.7", "3.0", "3.7", "3.3"]);
  await page.getByRole("link", { name: "View course CMPS 261", exact: true }).click();
  for (const [label, value] of [["Difficulty", "5"], ["Workload", "1"], ["Usefulness", "4"], ["Overall experience", "3"]]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
  }
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await scores(summary(page, "CMPS 261"), ["3.7", "2.3", "3.3", "3.0"]);
  await expect(summary(page, "CMPS 261")).toContainText("3 reviews");
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await scores(summary(page, "CMPS 261"), ["3.7", "2.3", "3.3", "3.0"]);
  await page.getByRole("link", { name: "View course CMPS 261", exact: true }).click();
  await page.getByRole("button", { name: "Delete my review", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(feedback(page)).toContainText("deleted");
  await insufficient(summary(page, "CMPS 261"), 2);
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await insufficient(summary(page, "CMPS 261"), 2);
});

for (const scenario of ["unavailable", "missing", "invalid"]) {
  test(`a ${scenario} ratings response preserves course content and the review form`, async ({ page }) => {
    await login(page, `ratings-${scenario}@mail.aub.edu`);
    await page.goto("/courses?q=CMPS104");
    await expect(page.getByRole("heading", { name: "Computing elective 4", exact: true })).toBeVisible();
    await expect(summary(page, "CMPS 104")).toContainText("Ratings are temporarily unavailable");
    await expect(summary(page, "CMPS 104")).not.toContainText("Not enough reviews yet");
    await expect(summary(page, "CMPS 104").locator("dl")).toHaveCount(0);
    await page.getByRole("link", { name: "View course CMPS 104", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Computing elective 4");
    await expect(summary(page, "CMPS 104")).toContainText("Ratings are temporarily unavailable");
    await expect(page.getByRole("button", { name: "Post review", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Synthetic private ratings failure");
    await page.reload();
    await expect(page.getByRole("button", { name: "Post review", exact: true })).toBeVisible();
  });
}

test("rating summaries fit a phone in light and dark modes", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/courses?q=CMPS105");
    await scores(summary(page, "CMPS 105"), ["2.5", "3.5", "3.3", "3.0"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/campusconnect-ratings-card-${colorScheme}.png`, fullPage: true });
    await page.getByRole("link", { name: "View course CMPS 105", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Computing elective 5");
    await scores(summary(page, "CMPS 105"), ["2.5", "3.5", "3.3", "3.0"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/campusconnect-ratings-detail-${colorScheme}.png`, fullPage: true });
  }
});

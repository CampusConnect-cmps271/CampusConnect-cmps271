import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "clubs-student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("club directory searches, filters and paginates with keyboard-friendly controls", async ({ page }) => {
  await login(page); await page.goto("/clubs");
  await expect(page.getByRole("heading", { name: "Campus clubs" })).toBeVisible();
  await expect(page.getByText("11 clubs found")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(9);
  await page.getByRole("link", { name: "Next →" }).click();
  await expect(page.locator("article")).toHaveCount(2);
  await page.getByLabel("Search clubs").fill("robotics");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "Robotics Club" })).toBeVisible();
  await expect(page.getByText("1 club found")).toBeVisible();
  await page.getByLabel("Club category").selectOption("Academic");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "No clubs match these filters" })).toBeVisible();
});

test("profile exposes only public contact details and a published announcement", async ({ page }) => {
  await login(page); await page.goto("/clubs/robotics-club");
  await expect(page.getByRole("heading", { name: "Robotics Club" })).toBeVisible();
  await expect(page.getByText("Verified club")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email club" })).toHaveAttribute("href", "mailto:robotics@example.edu");
  await expect(page.getByRole("heading", { name: "Robotics workshop" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("verified representative can create a club announcement", async ({ page }) => {
  await login(page, "clubs-representative@mail.aub.edu"); await page.goto("/clubs/robotics-club");
  await page.getByRole("link", { name: "New announcement" }).click();
  await page.getByLabel("Title").fill("Competition registration");
  await page.getByLabel("Announcement").fill("Registration for the robotics competition opens tomorrow morning.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/clubs\/robotics-club\/announcements\/30000000-0000-4000-8000-000000000099$/);
  await expect(page.getByRole("heading", { name: "Competition registration" })).toBeVisible();
});

test("unknown club has a distinct not-found page", async ({ page }) => {
  await login(page); await page.goto("/clubs/does-not-exist");
  await expect(page.getByRole("heading", { name: "Club not found" })).toBeVisible();
});

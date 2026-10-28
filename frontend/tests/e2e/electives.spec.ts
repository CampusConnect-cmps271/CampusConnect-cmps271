import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, email = "electives-owner@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
test("preferences keep invalid drafts, save, reload and remain private on mobile", async ({ page, browser }) => {
  await login(page); await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/electives/preferences");
  await page.getByLabel("Interests", { exact: true }).fill("robotics, فن");
  await page.getByLabel("Academic goals", { exact: true }).fill("Learn design");
  await page.getByLabel("Completed course codes (self-reported)").fill("FAKE 999");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("check");
  await expect(page.getByLabel("Interests", { exact: true })).toHaveValue("robotics, فن");
  await page.getByLabel("Completed course codes (self-reported)").fill("CMPS 101");
  await page.getByLabel("Completed course codes (self-reported)").press("Tab");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload(); await expect(page.getByLabel("Academic goals", { exact: true })).toHaveValue("Learn design");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const context = await browser.newContext(); const other = await context.newPage();
  await login(other, "electives-other@mail.aub.edu"); await other.goto("/electives/preferences");
  await expect(other.getByLabel("Academic goals", { exact: true })).toHaveValue(""); await context.close();
});
test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/electives/preferences"); await expect(page).toHaveURL(/\/login/);
});

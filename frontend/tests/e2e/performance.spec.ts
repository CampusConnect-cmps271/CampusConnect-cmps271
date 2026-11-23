import { expect, test } from "@playwright/test";
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
test("administrator can review response times and slow database operations", async ({ page }) => {
  await login(page, "clubs-admin@mail.aub.edu");
  await page.goto("/admin/performance");
  await expect(page.getByRole("heading", { name: "Performance dashboard" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "POST /api/electives/recommendations" });
  await expect(row).toContainText("2000.0 ms"); await expect(row).toContainText("1200.0 ms");
  await expect(page.getByRole("row").filter({ hasText: "rpc/elective_candidate_page" })).toContainText("350.0 ms");
  await page.getByRole("link", { name: "1h", exact: true }).click();
  await expect(page).toHaveURL(/range=1h/);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-performance-dashboard.png", fullPage: true });
});
test("students and signed-out visitors cannot read the performance dashboard", async ({ page }) => {
  await page.goto("/admin/performance");
  await expect(page.getByRole("heading", { name: "Performance dashboard" })).toHaveCount(0);
  await login(page, "student@mail.aub.edu"); await page.goto("/admin/performance");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Performance dashboard" })).toHaveCount(0);
});

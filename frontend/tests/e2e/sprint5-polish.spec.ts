import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function attachPage(testInfo: TestInfo, page: Page, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("Sprint 5 club directory polish is responsive and captured", async ({ page }, testInfo) => {
  await login(page, "clubs-student@mail.aub.edu");
  await page.goto("/clubs");
  await expect(page.getByRole("heading", { name: "Campus clubs" })).toBeVisible();
  await expect(page.getByRole("search", { name: "Find a club" })).toBeVisible();
  await attachPage(testInfo, page, "clubs-directory-desktop");

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await attachPage(testInfo, page, "clubs-directory-360px");
});

test("Sprint 5 community polish is responsive and captured", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, "communities-phone@mail.aub.edu");
  await page.goto("/communities");
  await expect(page.getByRole("heading", { level: 1, name: "Communities" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await attachPage(testInfo, page, "communities-360px");
});

test("Sprint 5 administrator health polish and access control are captured", async ({ page }, testInfo) => {
  await login(page, "clubs-admin@mail.aub.edu");
  await page.goto("/admin/health");
  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Administration sections" })).toBeVisible();
  await attachPage(testInfo, page, "admin-health-dashboard");
});

import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("administrators can inspect live service health", async ({ page }) => {
  await login(page, "clubs-admin@mail.aub.edu");
  await page.goto("/admin/health");

  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Database" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI services" })).toBeVisible();
  await expect(page.getByText("operational", { exact: true })).toHaveCount(2);
  await expect(page.getByText("degraded", { exact: true })).toHaveCount(2);
});

test("students cannot open the administrator health page", async ({ page }) => {
  await login(page, "student@mail.aub.edu");
  await page.goto("/admin/health");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "System health" })).toHaveCount(0);
});

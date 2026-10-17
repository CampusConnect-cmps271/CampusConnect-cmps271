import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test of the live deployment (SCRUM-182). See playwright.smoke.config.ts.
 * Uses the seeded demo accounts; leaves nothing behind but one soft-deleted post.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Put it in .env.hosted.local.`);
  return value;
}

test.beforeAll(() => {
  required("SMOKE_BASE_URL");
});

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("the landing page loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Your campus/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the demo student reads the feed, posts, deletes the post and logs out", async ({ page }) => {
  await logIn(page, required("DEMO_STUDENT_EMAIL"), required("DEMO_STUDENT_PASSWORD"));

  await expect(page.getByRole("heading", { name: /^Welcome, / })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campus Feed" })).toBeVisible();
  // The seeded sample posts are on the feed.
  await expect(page.getByRole("article").first()).toBeVisible();

  const title = `Smoke test ${new Date().toISOString()}`;
  await page.getByRole("link", { name: "New post" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption("General");
  await page.getByLabel("Content").fill("Automated smoke test of the live site. This post deletes itself.");
  await page.getByRole("button", { name: "Create post" }).click();

  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Delete post" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(title)).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
});

test("the demo administrator reaches /admin", async ({ page }) => {
  await logIn(page, required("DEMO_ADMIN_EMAIL"), required("DEMO_ADMIN_PASSWORD"));

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "User roles" })).toBeVisible();
});

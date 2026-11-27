import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
async function calls(page: Page) {
  return (await (await page.request.get("http://127.0.0.1:3101/test/courses/shared-cache-calls")).json()).calls as number;
}

async function callerCalls(page: Page) {
  return (await (await page.request.get("http://127.0.0.1:3101/test/courses/shared-cache-calls")).json()).callerCalls as number;
}

test("different signed-in browsers reuse the same cache entry and signed-out visitors cannot read it", async ({ page, browser }) => {
  const nonce = `cache probe ${Date.now()}`;
  const path = `/courses?q=${encodeURIComponent(nonce)}`;
  await login(page, "ratings-reader@mail.aub.edu");
  const before = await calls(page);
  const beforeCaller = await callerCalls(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Course catalogue", exact: true })).toBeVisible();
  expect(await calls(page)).toBe(before + 1);
  await page.reload();
  expect(await calls(page)).toBe(before + 1);

  const second = await browser.newContext();
  const other = await second.newPage();
  await login(other, "reviews-other@mail.aub.edu");
  await other.goto(path);
  await expect(other.getByRole("heading", { name: "Course catalogue", exact: true })).toBeVisible();
  expect(await calls(page)).toBe(before + 1);
  await second.close();

  const signedOut = await browser.newContext();
  const visitor = await signedOut.newPage();
  await visitor.goto(path);
  await expect(visitor).toHaveURL(/\/login\?/);
  expect(await calls(page)).toBe(before + 1);
  await signedOut.close();
  expect(await callerCalls(page)).toBe(beforeCaller);
});

test("saving a review invalidates the warmed catalogue and shows the new count immediately", async ({ page }) => {
  await login(page, "ratings-editor@mail.aub.edu");
  const group = () => page.getByRole("group", { name: "Course ratings for CMPS 261", exact: true });
  await page.goto("/courses?q=CMPS261");
  await expect(group()).toContainText("2 reviews");
  const warmCalls = await calls(page);
  await page.reload();
  await expect(group()).toContainText("2 reviews");
  expect(await calls(page)).toBe(warmCalls);
  await page.getByRole("link", { name: "View course CMPS 261", exact: true }).click();
  for (const [label, value] of [["Difficulty", "2"], ["Workload", "3"], ["Usefulness", "5"], ["Overall experience", "4"]]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
  }
  await page.getByLabel("Semester taken", { exact: true }).fill("Fall 2026");
  await page.getByLabel("Your written review", { exact: true }).fill("Useful modelling exercises and clear examples.");
  await page.getByLabel("I completed this course", { exact: true }).check();
  await page.getByRole("button", { name: "Post review", exact: true }).click();
  await expect(page.getByLabel("Review feedback", { exact: true })).toContainText("saved", { timeout: 20_000 });
  await page.goto("/courses?q=CMPS261");
  await expect(group()).toContainText("3 reviews");
  expect(await calls(page)).toBeGreaterThan(warmCalls);
});

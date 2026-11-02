import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "electives-owner@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
}
async function fillDraft(page: Page) {
  await page.getByLabel("Interests", { exact: true }).fill("robotics, فن");
  await page.getByLabel("Academic goals", { exact: true }).fill("Learn design");
  await page.getByLabel("Completed course codes (self-reported)").fill("FAKE 999");
}
test("mobile questionnaire preserves invalid drafts, saves, reloads and edits privately", async ({ page, browser }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("link", { name: "Elective preferences", exact: true }).click();
  await fillDraft(page);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("draft has been kept");
  await expect(page.getByLabel("Interests", { exact: true })).toHaveValue("robotics, فن");
  await expect(page.getByLabel("Completed course codes (self-reported)")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Completed course codes (self-reported)").fill("cmps 101");
  await page.getByLabel("Completed course codes (self-reported)").press("Tab");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(page.getByLabel("Academic goals", { exact: true })).toHaveValue("Learn design");
  await expect(page.getByLabel("Interests", { exact: true })).toHaveValue("robotics, فن");
  await expect(page.getByLabel("Completed course codes (self-reported)")).toHaveValue("CMPS 101");
  await page.getByLabel("Preferred workload", { exact: true }).selectOption("light");
  await page.getByLabel("Academic goals", { exact: true }).fill("Build a robot");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(page.getByLabel("Academic goals", { exact: true })).toHaveValue("Build a robot");
  await expect(page.getByLabel("Preferred workload", { exact: true })).toHaveValue("light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "electives-other@mail.aub.edu");
  await other.goto("/electives/preferences");
  await expect(other.getByLabel("Academic goals", { exact: true })).toHaveValue("");
  await otherContext.close();
});
test("server validation keeps a draft even when JavaScript is unavailable", async ({ page, browser }) => {
  await login(page, "electives-native@mail.aub.edu");
  const context = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
  const native = await context.newPage();
  await native.goto("/electives/preferences");
  await fillDraft(native);
  await native.getByLabel("Completed course codes (self-reported)").press("Enter");
  await expect(native.locator("main").getByRole("alert")).toContainText("draft has been kept");
  await expect(native.getByLabel("Interests", { exact: true })).toHaveValue("robotics, فن");
  await expect(native.getByLabel("Academic goals", { exact: true })).toHaveValue("Learn design");
  await expect(native.getByLabel("Completed course codes (self-reported)")).toHaveValue("FAKE 999");
  await native.getByLabel("Completed course codes (self-reported)").fill("CMPS 101");
  await native.getByLabel("Completed course codes (self-reported)").press("Enter");
  await expect(native.getByRole("status")).toHaveText("Preferences saved.");
  await native.reload();
  await expect(native.getByLabel("Academic goals", { exact: true })).toHaveValue("Learn design");
  await context.close();
});
test("save failures keep the draft and hide database details", async ({ page }) => {
  await login(page, "electives-failure@mail.aub.edu");
  await page.goto("/electives/preferences");
  await fillDraft(page);
  await page.getByLabel("Completed course codes (self-reported)").fill("");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("please try again");
  await expect(page.getByLabel("Academic goals", { exact: true })).toHaveValue("Learn design");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await expect(page.locator("main")).not.toContainText("private SQL details");
});
test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/electives/preferences");
  await expect(page).toHaveURL(/\/login/);
});
test("empty, whitespace and over-limit drafts can be corrected to saved Unicode preferences", async ({ page }) => {
  test.setTimeout(45_000);
  await login(page, "electives-validation@mail.aub.edu");
  await page.goto("/electives/preferences");
  const interests = page.getByLabel("Interests", { exact: true });
  const goals = page.getByLabel("Academic goals", { exact: true });
  const completed = page.getByLabel("Completed course codes (self-reported)");
  const save = page.getByRole("button", { name: "Save preferences" });
  let submissions = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/electives/preferences") submissions++;
  });
  await save.click();
  await expect(page.locator("#interests:invalid")).toBeVisible();
  expect(submissions).toBe(0);
  await interests.fill("  ,  ");
  await goals.fill("   ");
  await save.click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(interests).toHaveAttribute("aria-invalid", "true");
  await expect(goals).toHaveAttribute("aria-invalid", "true");
  await expect(interests).toHaveValue("  ,  ");
  await goals.fill("تعلم تصميم الروبوتات");
  await interests.fill(Array.from({ length: 11 }, (_, i) => `interest${i}`).join(", "));
  await save.click();
  await expect(page.locator("#interests-error")).toContainText("10");
  await expect(goals).toHaveValue("تعلم تصميم الروبوتات");
  await interests.fill("تعلم الآلة, فن, فن");
  await completed.fill("cmps 101, CMPS 101");
  await completed.press("Tab");
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(interests).toHaveValue("تعلم الآلة, فن");
  await expect(goals).toHaveValue("تعلم تصميم الروبوتات");
  await expect(completed).toHaveValue("CMPS 101");
  await expect(page.getByText("These are not verified academic records.", { exact: false })).toBeVisible();
});

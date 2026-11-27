import { expect, test, type Page } from "@playwright/test";

/**
 * Keyboard review that axe cannot do (SCRUM-312): the skip link, a visible focus
 * indicator on every tab stop, and the report panel's focus handling. Every test
 * uses only the keyboard after the page has loaded.
 */
async function logIn(page: Page, email = "student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/(home|profile)$/, { timeout: 30_000 });
}

test.describe("skip link", () => {
  for (const path of ["/", "/login", "/forgot-password"]) {
    test(`${path}: the first Tab stop skips to the main content`, async ({ page }) => {
      await page.goto(path);
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content", exact: true });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();

      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("MAIN");
    });
  }

  test("a signed-in page offers it too", async ({ page }) => {
    await logIn(page);
    await page.goto("/saved");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content", exact: true })).toBeFocused();
  });
});

test.describe("visible focus", () => {
  for (const path of ["/", "/login", "/register", "/forgot-password"]) {
    test(`${path}: every Tab stop shows a focus indicator`, async ({ page }) => {
      await page.goto(path);
      const missing: string[] = [];
      for (let stop = 0; stop < 14; stop++) {
        await page.keyboard.press("Tab");
        const state = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          // The Next.js dev overlay (<nextjs-portal>) exists only in `next dev`; it is not part of the app.
          if (!el || el === document.body || el.closest("nextjs-portal")) return null;
          const style = getComputedStyle(el);
          const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
          const shadow = style.boxShadow !== "none";
          const border = el.matches("input, textarea, select");
          return { label: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`, visible: outline || shadow || border };
        });
        if (state && !state.visible) missing.push(state.label);
      }
      expect(missing).toEqual([]);
    });
  }
});

test("the report panel takes focus when opened, closes on Escape and gives focus back", async ({ browser, baseURL }) => {
  const title = `A11y review ${Date.now()}`;

  // One student writes a post; a different student reads it, because authors are not offered Report.
  const author = await browser.newContext({ baseURL });
  const authorPage = await author.newPage();
  await logIn(authorPage);
  await authorPage.goto("/posts/new");
  await authorPage.getByLabel("Title").fill(title);
  await authorPage.getByLabel("Category").selectOption("General");
  await authorPage.getByLabel("Content").fill("Body for the report panel check.");
  await authorPage.getByRole("button", { name: "Create post" }).click();
  await expect(authorPage).toHaveURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const postUrl = authorPage.url();
  await author.close();

  const reader = await browser.newContext({ baseURL });
  const page = await reader.newPage();
  await logIn(page, "notify-lina@mail.aub.edu");
  await page.goto(postUrl);
  const opener = page.getByRole("button", { name: "Report post", exact: true });
  await expect(opener).toBeVisible({ timeout: 30_000 });
  expect(((await opener.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);

  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Reason")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Reason")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Report post", exact: true })).toBeFocused();
  await reader.close();
});

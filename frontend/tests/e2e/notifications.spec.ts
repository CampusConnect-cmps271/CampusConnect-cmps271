import { expect, test, type Page } from "@playwright/test";

// SP2-40..42 against the mocked Supabase. The mock creates message
// notifications like the database trigger does; Realtime is not mocked, so
// these tests reload where a live update would arrive. Comment and removal
// notifications are covered by tests/notifications.test.mjs and the manual
// test in the PR.
const lina = { email: "notify-lina@mail.aub.edu", id: "00000000-0000-4000-8000-000000000009", name: "Lina Haddad" };
const karim = { email: "notify-karim@mail.aub.edu", id: "00000000-0000-4000-8000-00000000000a", name: "Karim Aoun" };
const nadia = { email: "notify-nadia@mail.aub.edu", id: "00000000-0000-4000-8000-00000000000b" };

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // The first visit to /home compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

async function send(page: Page, text: string) {
  const box = page.getByLabel(`Message ${karim.name}`);
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByRole("log").getByText(text)).toBeVisible();
  await expect(page.getByRole("log").getByText("Sending…")).toHaveCount(0);
}

const bell = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Notifications/ });

test.describe.configure({ mode: "serial" });

let conversationPath = "";

test.beforeAll(async ({ request }) => {
  await request.post(
    `http://127.0.0.1:3101/test/messaging/reset?ids=${[lina.id, karim.id, nadia.id].join(",")}`,
  );
});

test("several messages make one notification for the recipient", async ({ page }) => {
  await logIn(page, lina.email);
  await page.goto(`/profile/${karim.id}`);
  await page.getByRole("button", { name: `Message ${karim.name}` }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  conversationPath = new URL(page.url()).pathname;

  for (const text of ["Hi Karim", "Are you free later?", "Library at 5?"]) {
    await send(page, text);
  }

  // The sender is not notified about their own messages.
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});

test("the bell shows the count, opens a panel and lands in the conversation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await logIn(page, karim.email);

  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await expect(bell(page)).toContainText("1");

  await bell(page).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  const item = panel.getByRole("link", { name: `Unread: ${lina.name} sent you a message` });
  await expect(item).toBeVisible();

  // Escape closes the panel and returns focus to the bell.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell(page)).toBeFocused();

  await bell(page).click();
  await panel.getByRole("link", { name: /sent you a message/ }).click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath}$`), { timeout: 20_000 });
  await expect(page.getByRole("log").getByText("Library at 5?")).toBeVisible();

  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});

test("Mark all as read clears the badge", async ({ page, browser }) => {
  const sender = await browser.newPage();
  await logIn(sender, lina.email);
  await sender.goto(conversationPath);
  await send(sender, "One more thing");
  await sender.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await logIn(page, karim.email);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");

  await bell(page).click();
  await page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Mark all as read" }).click();
  await expect(bell(page)).toHaveAccessibleName("Notifications");

  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});

test("on a phone the bell opens the notifications page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, karim.email);

  const phoneBell = page.getByRole("banner").getByRole("link", { name: /^Notifications/ });
  await expect(phoneBell).toHaveCount(1);
  await expect(bell(page)).toHaveCount(0);

  await phoneBell.click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Notifications" })).toContainText(`${lina.name} sent you a message`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("another student sees none of them", async ({ page }) => {
  await logIn(page, nadia.email);
  await expect(bell(page)).toHaveAccessibleName("Notifications");

  await page.goto("/notifications");
  await expect(page.getByText("You're all caught up.")).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";

// SP2-36..39 against the mocked Supabase. Realtime is not mocked, so live
// delivery is covered by the manual two-browser test in the PR.
const maya = { email: "messaging-maya@mail.aub.edu", id: "00000000-0000-4000-8000-000000000006", name: "Maya Saleh" };
const omar = { email: "messaging-omar@mail.aub.edu", id: "00000000-0000-4000-8000-000000000007", name: "Omar Fares" };
const rami = { email: "messaging-rami@mail.aub.edu", name: "Rami Nassar" };

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

const header = (page: Page) => page.getByRole("banner").getByRole("navigation", { name: "Main" });

// A sent message shows at once; wait until the server has saved it, or the
// next navigation can abort the send.
async function expectSaved(page: Page) {
  await expect(page.getByRole("log").getByText("Sending…")).toHaveCount(0);
}

// One conversation runs through these tests, in order.
test.describe.configure({ mode: "serial" });

let conversationPath = "";

test.beforeAll(async ({ request }) => {
  await request.post("http://127.0.0.1:3101/test/messaging/reset");
});

test("a student starts a conversation from a profile and sends a message", async ({ page }) => {
  await logIn(page, maya.email);

  // No Message button on your own profile.
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Student Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Message/ })).toHaveCount(0);

  await page.goto(`/profile/${omar.id}`);
  await page.getByRole("button", { name: `Message ${omar.name}` }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  conversationPath = new URL(page.url()).pathname;

  await expect(page.getByRole("heading", { level: 1, name: omar.name })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).getByRole("link")).toHaveAttribute(
    "href",
    `/profile/${omar.id}`,
  );
  const log = page.getByRole("log", { name: `Messages with ${omar.name}` });
  await expect(log).toContainText("No messages yet");

  const box = page.getByLabel(`Message ${omar.name}`);
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await box.fill("Hi Omar, are you joining the study group?");
  await expect(page.getByText("41/2000")).toBeVisible();
  await box.press("Enter");
  await expect(log.getByText("Hi Omar, are you joining the study group?")).toBeVisible();
  await expect(box).toHaveValue("");
  await expectSaved(page);

  // Saved, not just shown: it is still there after a reload.
  await page.reload();
  await expect(page.getByRole("log").getByText("Hi Omar, are you joining the study group?")).toBeVisible();

  // Message again from the profile reopens the same conversation.
  await page.goto(`/profile/${omar.id}`);
  await page.getByRole("button", { name: `Message ${omar.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath}$`), { timeout: 20_000 });
});

test("multi-line and long messages stay plain text on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, maya.email);
  await page.goto(conversationPath);

  const box = page.getByLabel(`Message ${omar.name}`);
  await box.fill("Line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("<b>not bold</b>");
  await expect(box).toHaveValue("Line one\n<b>not bold</b>");
  await box.press("Enter");

  const log = page.getByRole("log");
  const item = log.getByRole("listitem").filter({ hasText: "not bold" });
  await expect(item.locator("p")).toContainText("Line one\n<b>not bold</b>", { useInnerText: true });
  await expect(log.locator("b")).toHaveCount(0);
  await expectSaved(page);

  await box.fill("z".repeat(2001));
  await expect(page.getByText("2001/2000")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await box.fill("z".repeat(2000));
  await box.press("Enter");
  await expect(log.getByText("z".repeat(2000))).toBeVisible();
  await expectSaved(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the recipient sees it unread in the inbox until they open it", async ({ page }) => {
  await logIn(page, omar.email);

  await expect(header(page).getByRole("link", { name: "Messages (1 unread)" })).toBeVisible();

  await header(page).getByRole("link", { name: /^Messages/ }).click();
  await expect(page).toHaveURL(/\/messages$/);
  const row = page.getByRole("list", { name: "Conversations" }).getByRole("link", { name: new RegExp(maya.name) });
  await expect(row).toContainText("Unread");
  await expect(row).toContainText("z".repeat(10));
  await expect(row).toContainText("just now");

  await row.click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath}$`));
  await expect(page.getByRole("log").getByText("Hi Omar, are you joining the study group?")).toBeVisible();

  // Opening the thread marks it read; the header count clears.
  await expect(header(page).getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  await page.goto("/messages");
  await expect(
    page.getByRole("list", { name: "Conversations" }).getByRole("link", { name: new RegExp(maya.name) }),
  ).not.toContainText("Unread");
});

test("a third student cannot open the conversation and has an empty inbox", async ({ page }) => {
  await logIn(page, rami.email);

  const response = await page.goto(conversationPath);
  expect(response?.status()).toBe(404);

  await page.goto("/messages");
  await expect(page.getByText("No conversations yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse the feed" })).toHaveAttribute("href", "/home");
});

test("the post page names the author and offers Message", async ({ page }) => {
  await logIn(page, rami.email);
  await page.goto("/posts/00000000-0000-4000-8000-0000000000a1");

  await expect(page.getByRole("link", { name: "Other Student" })).toHaveAttribute(
    "href",
    "/profile/00000000-0000-4000-8000-000000000004",
  );
  await page.getByRole("button", { name: "Message Other Student" }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Other Student" })).toBeVisible();
});

test("the header fits a phone and marks the current section", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, rami.email);

  await expect(header(page).getByRole("link", { name: "CampusConnect" })).toHaveAttribute("href", "/home");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await header(page).getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(header(page).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");

  await header(page).getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

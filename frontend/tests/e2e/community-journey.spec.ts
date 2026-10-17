import { expect, test, type Page } from "@playwright/test";

const email = "student@mail.aub.edu";

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/(home|profile)$/);
}

async function createPost(page: Page, title: string, body: string) {
  await page.goto("/posts/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption("General");
  await page.getByLabel("Content").fill(body);
  await page.getByRole("button", { name: "Create post" }).click();
  // The first visit to a post page compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

// The posts, comments, upvotes and saved posts live in one in-memory fixture
// that these tests share, so they run one after another.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await request.post("http://127.0.0.1:3101/test/community/reset");
});

test.describe("signed-out visitors", () => {
  for (const path of ["/saved", "/posts/new"]) {
    test(`${path} sends a signed-out visitor to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }
});

test.describe("student journey", () => {
  const title = "E2E journey: where to find quiet study space";

  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("a student publishes a post that appears in the feed", async ({ page }) => {
    await createPost(page, title, "Looking for quiet study spots near the library.");

    await page.goto("/home");
    const card = page.getByRole("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText("General");
    await expect(card).toContainText("0 upvotes");
  });

  test("a post cannot be created without a title or category", async ({ page }) => {
    await page.goto("/posts/new");
    await page.getByRole("button", { name: "Create post" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Please enter a title.");
    await page.getByLabel("Title").fill("No category");
    await page.getByLabel("Content").fill("Body");
    await page.getByRole("button", { name: "Create post" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Please select a category.");
    await expect(page).toHaveURL(/\/posts\/new$/);
  });

  test("a student comments on a post and replies to the comment", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: title }).click();

    const comments = page.getByRole("region", { name: /Comments/ });
    await expect(comments).toContainText("No comments yet");

    await comments.getByLabel("Write a comment").fill("Try the third floor of the library.");
    await comments.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(comments.getByText("Try the third floor of the library.")).toBeVisible();
    await expect(comments.getByRole("heading", { name: "Comments (1)" })).toBeVisible();

    await comments.getByRole("button", { name: "Reply" }).click();
    await comments.getByLabel("Write a reply").fill("Thanks, that helped!");
    await comments.getByRole("button", { name: "Reply", exact: true }).last().click();
    await expect(comments.getByText("Thanks, that helped!")).toBeVisible();
    await expect(comments.getByRole("heading", { name: "Comments (2)" })).toBeVisible();

    // Replies are one level deep: only the top-level comment offers Reply.
    await expect(comments.getByRole("button", { name: "Reply", exact: true })).toHaveCount(1);
  });

  test("an empty comment is not submitted", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: title }).click();
    const comments = page.getByRole("region", { name: /Comments/ });
    await expect(comments.getByRole("button", { name: "Comment", exact: true })).toBeDisabled();
    await comments.getByLabel("Write a comment").fill("   ");
    await expect(comments.getByRole("button", { name: "Comment", exact: true })).toBeDisabled();
  });

  test("a student upvotes and removes the upvote", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: title }).click();

    const upvote = page.getByRole("button", { name: /Upvote/ });
    await upvote.click();
    await expect(page.getByRole("button", { name: /Upvoted \(1\)/ })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/home");
    await expect(page.getByRole("article").filter({ hasText: title })).toContainText("1 upvotes");

    await page.getByRole("link", { name: title }).click();
    await page.getByRole("button", { name: /Upvoted/ }).click();
    await expect(page.getByRole("button", { name: /Upvote \(0\)/ })).toHaveAttribute("aria-pressed", "false");
  });

  test("a student saves a post, finds it on the Saved page and unsaves it", async ({ page }) => {
    await page.goto("/saved");
    await expect(page.getByText("You haven't saved any posts yet.")).toBeVisible();

    await page.goto("/home");
    await page.getByRole("link", { name: title }).click();
    await page.getByRole("button", { name: "☆ Save" }).click();
    await expect(page.getByRole("button", { name: "★ Saved" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/home");
    await page.getByRole("link", { name: "Saved", exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByRole("heading", { name: "Saved posts" })).toBeVisible();
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    await page.getByRole("button", { name: "★ Saved" }).click();
    await expect(page.getByRole("button", { name: "☆ Save" })).toBeVisible();
    await page.goto("/saved");
    await expect(page.getByText("You haven't saved any posts yet.")).toBeVisible();
  });

  test("a post that does not exist shows not found", async ({ page }) => {
    const response = await page.goto("/posts/00000000-0000-4000-8000-0000000000ff");
    expect(response?.status()).toBe(404);
  });

  test("the post page stays inside a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/home");
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("region", { name: /Comments/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

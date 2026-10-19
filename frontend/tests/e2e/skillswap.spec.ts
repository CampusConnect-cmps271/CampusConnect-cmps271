import { expect, test, type Page } from "@playwright/test";

// SP2-53..55 against the mocked Supabase: this replaces SP2-57's "SkillSwap
// matching" journey now that SkillSwap is a post template.
const sami = { email: "skillswap-sami@mail.aub.edu", name: "Sami Haddad" };
const dana = { email: "skillswap-dana@mail.aub.edu" };

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // The first visit to /home compiles it in dev, which can outlast 5s.
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

test.beforeAll(async ({ request }) => {
  await request.post("http://127.0.0.1:3101/test/skillswap/reset");
});

test("a student offers a skill swap, and another finds it and can message them", async ({ browser }) => {
  const author = await browser.newPage();
  await logIn(author, sami.email);

  await test.step("the template creates the post", async () => {
    await author.goto("/skillswap/new");
    await author.getByRole("button", { name: "Post skill swap" }).click();
    await expect(author.getByText("Tell students what you can teach.")).toBeVisible();

    await author.getByLabel("I can teach").fill("Python for CMPS 200");
    await author.getByLabel("I want to learn").fill("Conversational French");
    await author.getByLabel("In person").check();
    await author.getByLabel(/Availability/).fill("Weekday evenings");
    await author.getByRole("button", { name: "Post skill swap" }).click();

    await expect(author).toHaveURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const swap = author.getByRole("region", { name: "Skill swap" });
    await expect(swap).toContainText("Python for CMPS 200");
    await expect(swap).toContainText("Conversational French");
    await expect(swap).toContainText("In person");
    // No Message button on your own post.
    await expect(author.getByRole("button", { name: /to arrange a swap/ })).toHaveCount(0);
  });

  await test.step("the board finds it by what the author can teach", async () => {
    await author.goto("/skillswap");
    await author.getByLabel("Search", { exact: true }).fill("python");
    await author.getByRole("button", { name: "Search", exact: true }).click();
    await expect(author).toHaveURL(/q=python/);
    await expect(author.getByRole("article").filter({ hasText: "Python for CMPS 200" })).toBeVisible();

    await author.getByLabel("Who wants to learn").check();
    await author.getByRole("button", { name: "Search", exact: true }).click();
    await expect(author).toHaveURL(/in=learn/);
    await expect(author.getByRole("article")).toHaveCount(0);
  });

  await test.step("another student opens it and messages the author", async () => {
    const reader = await browser.newPage();
    await logIn(reader, dana.email);
    await reader.goto("/skillswap?q=python");
    await reader.getByRole("link", { name: `View skill swap from ${sami.name}` }).click();
    await expect(reader).toHaveURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    await reader.getByRole("button", { name: `Message ${sami.name} to arrange a swap` }).click();
    await expect(reader).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(reader.getByRole("heading", { level: 1, name: sami.name })).toBeVisible();
  });
});

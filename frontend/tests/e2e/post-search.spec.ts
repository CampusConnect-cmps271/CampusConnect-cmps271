import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "search-student@mail.aub.edu") {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const field = (page: Page) => page.getByLabel("Search posts by keyword", { exact: true });
const submit = (page: Page) => page.getByRole("button", { name: "Search posts", exact: true }).click();
const cards = (page: Page) => page.getByRole("region", { name: "Post search results", exact: true }).getByRole("article");

test("searches from the feed, keeps relevance order, opens a post and restores the search", async ({ page }) => {
  await login(page);
  await field(page).fill("scholarships");
  await field(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=scholarships$/);
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).first()).toContainText("Scholarships for campus students");
  await expect(page.getByRole("status")).toContainText("3 results on this page");
  await expect(page.locator("main")).not.toContainText("Deleted scholarships");
  await page.reload();
  await expect(field(page)).toHaveValue("scholarships");
  await page.getByRole("link", { name: "Scholarships for campus students", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scholarships for campus students");
  await page.goBack();
  await expect(field(page)).toHaveValue("scholarships");
  await expect(cards(page)).toHaveCount(3);
});

test("Arabic and mixed-language keywords survive refresh and URL encoding", async ({ page }) => {
  await login(page);
  await page.goto("/search");
  await field(page).fill("المنح");
  await submit(page);
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText("المنح الدراسية للطلاب");
  await page.reload();
  await expect(field(page)).toHaveValue("المنح");
  await field(page).fill("المنح scholarships");
  await submit(page);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText("Mixed language guidance");
  expect(new URL(page.url()).searchParams.get("q")).toBe("المنح scholarships");
});

test("pagination preserves the query while a new search resets the page and Back restores the field", async ({ page }) => {
  await login(page);
  await page.goto("/search?q=searchpagination");
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole("link", { name: "Next results →", exact: true }).click();
  await expect(cards(page)).toHaveCount(5);
  await expect(page.getByRole("navigation", { name: "Post search pages", exact: true })).toContainText("Page 2");
  expect(new URL(page.url()).searchParams.get("q")).toBe("searchpagination");
  await field(page).fill("scholarships");
  await submit(page);
  await expect(cards(page)).toHaveCount(3);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.goBack();
  await expect(cards(page)).toHaveCount(5);
  await expect(field(page)).toHaveValue("searchpagination");
  await page.getByRole("link", { name: "← Previous results", exact: true }).click();
  await expect(cards(page)).toHaveCount(20);
});

test("no-match searches offer a safely prefilled question without submitting a post", async ({ page }) => {
  await login(page);
  const question = "How do I use C++ & SQL? ما الحل";
  await page.goto(`/search?${new URLSearchParams({ q: question })}`);
  await expect(page.getByRole("heading", { name: "No posts found", exact: true })).toBeVisible();
  const ask = page.getByRole("link", { name: "Ask this question", exact: true });
  const href = await ask.getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("title")).toBe(question);
  await ask.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(question);
  await expect(page.getByLabel("Content", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/posts\/new\?/);
  await page.goto("/posts/new");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
});

test("a prefilled question waits for hydration before accepting edits", async ({ page }) => {
  await login(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/posts/new?title=Original+question", { waitUntil: "commit" });
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Original question");
    await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Create post", exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
  await page.unroute("**/_next/static/**/*.js");
  await page.getByLabel("Title", { exact: true }).fill("Replacement question");
  await page.getByLabel("Content", { exact: true }).fill("A draft only, without publishing.");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Replacement question");
  await expect(page).toHaveURL(/\/posts\/new\?/);
});

test("blank searches prompt for keywords, Clear removes drafts, and stale pages offer page one", async ({ page }) => {
  await login(page);
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "What are you looking for?", exact: true })).toBeVisible();
  await field(page).fill("unsent draft");
  await page.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(field(page)).toHaveValue("");
  await page.goto("/search?q=searchpagination&page=9999");
  await expect(page.getByRole("heading", { name: "That page has no results", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask this question", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "First page of results", exact: true }).click();
  await expect(cards(page)).toHaveCount(20);
  await page.goto("/search?q=scholarships&q=ignored&page=2junk");
  await expect(field(page)).toHaveValue("scholarships");
  await expect(cards(page)).toHaveCount(3);
});

for (const email of ["search-unavailable@mail.aub.edu", "search-invalid@mail.aub.edu"]) {
  test(`a failed or malformed search stays distinct from no matches: ${email}`, async ({ page }) => {
    await login(page, email);
    await page.goto("/search?q=scholarships&page=2");
    await expect(page.getByRole("alert", { name: "Posts couldn’t be searched", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try search again", exact: true })).toHaveAttribute("href", "/search?q=scholarships&page=2");
    await expect(field(page)).toHaveValue("scholarships");
    await expect(page.getByRole("heading", { name: "No posts found", exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Synthetic private post search failure");
  });
}

test("post snippets render markup as text", async ({ page }) => {
  await login(page);
  await page.goto("/search?q=rendercheck");
  await expect(cards(page)).toContainText("<script>alert('not-run')</script>");
  await expect(cards(page).locator("script")).toHaveCount(0);
});

test("search and the question handoff fit a phone in light and dark modes", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/search?${new URLSearchParams({ q: "المنح" })}`);
  await expect(cards(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-post-search-mobile.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-post-search-mobile-dark.png", fullPage: true });
  await page.goto(`/search?${new URLSearchParams({ q: "س".repeat(200) })}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Ask this question", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a direct search URL requires sign-in", async ({ page }) => {
  await page.goto("/search?q=scholarships");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Search campus posts", exact: true })).toHaveCount(0);
});

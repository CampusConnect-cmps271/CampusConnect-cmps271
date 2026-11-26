import { expect, test, type Page } from "@playwright/test";

// SCRUM-302: the assistant page's states, against the mocked Supabase. The
// assistant API itself is stubbed per test, so these cover the interface
// (examples, retry, timeout wording, privacy note, accessible links) and not
// the retrieval, which tests/api/campus-assistant*.test.ts already cover.
const student = "assistant-ui@mail.aub.edu";

async function openAssistant(page: Page) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(student);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "Campus assistant", exact: true })).toBeVisible();
}

const answer = {
  answer: "Request it from the Registrar.",
  insufficient_evidence: false,
  citations: [
    {
      chunk_id: "c1",
      title: "Transcript requests",
      url: "https://www.aub.edu.lb/registrar/Pages/transcripts.aspx",
      retrieved_at: "2026-11-01T00:00:00.000Z",
      source_label: "AUB Registrar",
    },
  ],
};

test("a first visit offers example questions that fill the question box", async ({ page }) => {
  await openAssistant(page);
  await expect(page.getByRole("heading", { name: /Try one of these/ })).toBeVisible();
  await page.getByRole("button", { name: "How do I request a transcript?", exact: true }).click();
  const box = page.getByLabel("Your question", { exact: true });
  await expect(box).toHaveValue("How do I request a transcript?");
  await expect(box).toBeFocused();
});

test("the privacy note explains what is and is not used", async ({ page }) => {
  await openAssistant(page);
  await page.getByText("How your questions are used", { exact: true }).click();
  await expect(page.getByText(/kept in this browser tab only/)).toBeVisible();
  await expect(page.getByText(/your own CampusConnect data, and only yours/)).toBeVisible();
});

test("a failed answer keeps the question and offers Try again, which then succeeds", async ({ page }) => {
  await openAssistant(page);
  let calls = 0;
  await page.route("**/api/campus-assistant", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 503, json: { message: "The assistant is unavailable right now. Please try again later." } })
      : route.fulfill({ json: answer });
  });

  await page.getByLabel("Your question", { exact: true }).fill("How do I request a transcript?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("The assistant is unavailable right now");
  await expect(page.getByLabel("Your question", { exact: true })).toHaveValue("How do I request a transcript?");

  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Request it from the Registrar.")).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(calls).toBe(2);
});

test("source links say they open a new tab and show where the source came from", async ({ page }) => {
  await openAssistant(page);
  await page.route("**/api/campus-assistant", (route) => route.fulfill({ json: answer }));
  await page.getByLabel("Your question", { exact: true }).fill("How do I request a transcript?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();

  const link = page.getByRole("link", { name: "Transcript requests (opens in a new tab)" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText(/AUB Registrar, retrieved/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Answer 1" })).toBeVisible();
});

test.describe("on a 360px phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the page fits and its controls are touch-sized", async ({ page }) => {
    await openAssistant(page);
    await page.getByLabel("Your question", { exact: true }).fill("How do I request a transcript?");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    for (const name of ["Ask", "How do I register for courses?"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

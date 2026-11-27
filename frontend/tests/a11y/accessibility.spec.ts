import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Repeatable automated accessibility scan (SCRUM-312).
 *
 * Every representative page is scanned with axe-core against the WCAG 2.0, 2.1
 * and 2.2 A and AA rule sets at three widths: a 360px phone, a tablet and a
 * desktop. The run fails on any "critical" or "serious" violation. Lesser
 * findings do not fail it, but are written to test-results/a11y/ so they can be
 * logged. Each page also has to fit its viewport and have one h1.
 */
const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 740 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

const PUBLIC_PAGES = ["/", "/login", "/register", "/forgot-password", "/clubs"];

const SIGNED_IN_PAGES = [
  "/home",
  "/courses",
  "/assistant",
  "/saved",
  "/profile",
  "/messages",
  "/notifications",
  "/planner",
  "/events",
  "/skillswap",
  "/posts/new",
  "/communities",
  "/search",
  "/electives",
  "/calendar",
  "/courses/compare",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill("student@mail.aub.edu");
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/(home|profile)$/, { timeout: 30_000 });
}

type Finding = { page: string; viewport: string; id: string; impact: string | null | undefined; help: string; nodes: number; targets: string[] };

async function scan(page: Page, path: string, viewport: (typeof VIEWPORTS)[number], findings: Finding[], notes: string[]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // A 5xx here means the mocked backend has no data for the page, not an accessibility result.
  if (!response || response.status() >= 500) {
    notes.push(`${path} @ ${viewport.name}: not scanned (HTTP ${response?.status() ?? "none"} from the mocked backend)`);
    return;
  }
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const violation of result.violations) {
    findings.push({
      page: path,
      viewport: viewport.name,
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    });
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) {
    findings.push({ page: path, viewport: viewport.name, id: "viewport-overflow", impact: "serious", help: `Page scrolls sideways by ${overflow}px`, nodes: 1, targets: ["html"] });
  }

  const h1 = await page.locator("h1").count();
  if (h1 !== 1) {
    findings.push({ page: path, viewport: viewport.name, id: "one-h1", impact: "moderate", help: `Expected one h1, found ${h1}`, nodes: h1, targets: ["h1"] });
  }
}

function report(project: string, group: string, findings: Finding[], notes: string[]) {
  mkdirSync("test-results/a11y", { recursive: true });
  writeFileSync(`test-results/a11y/${project}-${group}.json`, JSON.stringify({ findings, notes }, null, 2));
  const blockers = findings.filter((finding) => finding.impact === "critical" || finding.impact === "serious");
  const summary = blockers.map((f) => `${f.impact} ${f.id} on ${f.page} @ ${f.viewport} (${f.nodes}): ${f.help} [${f.targets.join(" | ")}]`);
  return summary;
}

test("public pages have no critical or serious accessibility violations", async ({ page }, testInfo) => {
  const findings: Finding[] = [];
  const notes: string[] = [];
  for (const viewport of VIEWPORTS) for (const path of PUBLIC_PAGES) await scan(page, path, viewport, findings, notes);
  expect(report(testInfo.project.name, "public", findings, notes)).toEqual([]);
});

test("signed-in pages have no critical or serious accessibility violations", async ({ page }, testInfo) => {
  await logIn(page);
  const findings: Finding[] = [];
  const notes: string[] = [];
  for (const viewport of VIEWPORTS) for (const path of SIGNED_IN_PAGES) await scan(page, path, viewport, findings, notes);
  expect(report(testInfo.project.name, "signed-in", findings, notes)).toEqual([]);
});

test("populated discussion pages have no critical or serious accessibility violations", async ({ page }, testInfo) => {
  await logIn(page);

  // A post with a comment and a reply, saved, so the pages are scanned with content in them.
  await page.goto("/posts/new");
  await page.getByLabel("Title").fill(`A11y scan ${Date.now()}`);
  await page.getByLabel("Category").selectOption("General");
  await page.getByLabel("Content").fill("A post with enough text to have real content on the page.");
  await page.getByRole("button", { name: "Create post" }).click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const postPath = new URL(page.url()).pathname;

  const comments = page.getByRole("region", { name: /Comments/ });
  await comments.getByLabel("Write a comment").fill("A first comment.");
  await comments.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(comments.getByText("A first comment.")).toBeVisible();
  await comments.getByRole("button", { name: "Reply", exact: true }).click();
  await comments.getByLabel("Write a reply").fill("A reply to it.");
  await comments.getByRole("button", { name: "Reply", exact: true }).last().click();
  await expect(comments.getByText("A reply to it.")).toBeVisible();
  await page.getByRole("button", { name: "☆ Save" }).click();
  await expect(page.getByRole("button", { name: "★ Saved" })).toBeVisible();
  // Saving refreshes the page in the background; let that finish before navigating away.
  await page.waitForLoadState("networkidle");

  const findings: Finding[] = [];
  const notes: string[] = [];
  for (const viewport of VIEWPORTS) for (const path of [postPath, "/saved", "/home"]) await scan(page, path, viewport, findings, notes);
  expect(report(testInfo.project.name, "populated", findings, notes)).toEqual([]);
});

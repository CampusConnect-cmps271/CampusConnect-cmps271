import { expect, test } from "@playwright/test";

test("semester browsing shows the right instructor, attributes and section rules on desktop and mobile", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill("course-detail@mail.aub.edu");
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/courses");
  await page.getByLabel("Semester", { exact: true }).selectOption("202720");
  await page.getByRole("button", { name: "Search courses" }).click();
  await expect(page.getByRole("status")).toContainText("1 course found");
  const card = page.locator("article");
  await expect(card).toContainText("Spring Instructor");
  await expect(card).toContainText("Writing in the Discipline");
  await expect(card).not.toContainText("Fall Instructor");
  await page.getByRole("link", { name: "View course CMPS 240", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("semester")).toBe("202720");
  const offerings = page.getByRole("region", { name: "Semester offerings" });
  await expect(offerings).toContainText("Spring 2026-2027");
  await expect(offerings).not.toContainText("Fall 2026-2027");
  const section = offerings.locator("details");
  await section.locator("summary").click();
  await expect(section).toContainText("Registration prerequisites: CMPS 101 or CMPS 102");
  await expect(section).toContainText("MW · 09:00–10:15");
  // Catalogue consent rules remain readable alongside the semester expression.
  await expect(page.getByRole("region", { name: "Prerequisites", exact: true })).toContainText("Instructor consent may also be required");
  await expect(offerings.getByRole("link", { name: "Resis", exact: true })).toHaveAttribute("href", "https://resis.org/");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/campusconnect-resis-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "← Back to courses", exact: true }).click();
  await page.getByLabel("Semester", { exact: true }).selectOption("202710");
  await page.getByRole("button", { name: "Search courses" }).click();
  await expect(page.locator("article")).toContainText("Fall Instructor");
  await expect(page.locator("article")).not.toContainText("Spring Instructor");
});

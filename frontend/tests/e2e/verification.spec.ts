import { expect, test, type Page } from "@playwright/test";

const email = "student@mail.aub.edu";

async function openVerification(page: Page) {
  // Intercept all Auth calls: these tests never use the real project or send email.
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 500, json: { message: "Unexpected Auth call in test" } }));
  await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
}

test("prefills email and validates input without making an Auth request", async ({ page }) => {
  let requests = 0;
  await openVerification(page);
  await page.route("**/auth/v1/verify", (route) => { requests++; return route.abort(); });
  await expect(page.getByLabel("University email", { exact: true })).toHaveValue(email);
  await page.getByLabel("Verification code").fill("123");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("8-digit");
  await page.getByLabel("University email", { exact: true }).fill("student@gmail.com");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("@mail.aub.edu");
  expect(requests).toBe(0);
});

test("handles an invalid or expired code and leaves the form usable", async ({ page }) => {
  await openVerification(page);
  await page.route("**/auth/v1/verify", (route) => route.fulfill({ status: 403, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "x-supabase-api-version" }, json: { code: "otp_expired", msg: "Token has expired or is invalid" } }));
  await page.getByLabel("Verification code").fill("01234567");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await expect(page.getByRole("button", { name: "Resend code", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Verification code")).toBeEnabled();
});

test("resends signup confirmation and prevents repeated clicks during cooldown", async ({ page }) => {
  await openVerification(page);
  let requests = 0;
  await page.route("**/auth/v1/resend", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ email, type: "signup" });
    await route.fulfill({ json: {} });
  });
  await page.getByLabel("Verification code").fill("01234567");
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("a new code has been requested");
  await expect(page.getByRole("button", { name: /Resend available in/ })).toBeDisabled();
  await expect(page.getByLabel("Verification code")).toHaveValue("");
  expect(requests).toBe(1);
});

test("shows rate limits and an SMTP timeout without claiming an email was sent", async ({ page }) => {
  await openVerification(page);
  await page.route("**/auth/v1/resend", (route) => route.fulfill({ status: 429, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "x-supabase-api-version" }, json: { code: "over_email_send_rate_limit", msg: "Rate limited" } }));
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: /Resend available in/ })).toBeDisabled();

  await page.reload();
  await page.route("**/auth/v1/resend", (route) => route.fulfill({ status: 504, json: { code: "request_timeout", msg: "private SMTP detail" } }));
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("couldn't complete");
  await expect(page.getByRole("button", { name: "Resend code", exact: true })).toBeEnabled();
});

test("continues to the profile after verification even when the roles migration is missing", async ({ page, context, request }) => {
  await openVerification(page);
  const roleLookupsBefore = (await (await request.get("http://127.0.0.1:3101/test/role-lookups")).json()).roleLookups;
  // A synthetic legacy JWT makes server-side Auth validation use the local
  // /user fixture. It is never sent to the real Supabase project.
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/auth/v1/verify", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ email, token: "01234567", type: "email" });
    await route.fulfill({ json: {
      access_token: accessToken, refresh_token: "test-refresh-token",
      expires_in: 3600, token_type: "bearer",
      user: { id: "00000000-0000-4000-8000-000000000001", email, email_confirmed_at: "2026-10-05T12:00:00Z", aud: "authenticated", role: "authenticated" },
    } });
  });
  await page.getByLabel("Verification code").fill("0123 4567");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to CampusConnect" })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith("sb-127-auth-token"))).toBe(true);
  await page.getByRole("button", { name: "Continue to CampusConnect" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByRole("heading", { name: "Student Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage user roles" })).toHaveCount(0);
  expect((await (await request.get("http://127.0.0.1:3101/test/role-lookups")).json()).roleLookups).toBeGreaterThan(roleLookupsBefore);
  expect(pageErrors).toEqual([]);
  await page.goto("/admin");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByRole("heading", { name: "Student Profile", exact: true })).toBeVisible();
});

test("keeps the page usable after a network failure", async ({ page }) => {
  await openVerification(page);
  await page.route("**/auth/v1/verify", (route) => route.abort("failed"));
  await page.getByLabel("Verification code").fill("01234567");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("connection");
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeEnabled();
});

test("disables both actions while a verification request is in flight", async ({ page }) => {
  await openVerification(page);
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/auth/v1/verify", async (route) => {
    await wait;
    await route.fulfill({ status: 403, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "x-supabase-api-version" }, json: { code: "otp_expired", msg: "Invalid code" } });
  });
  await page.getByLabel("Verification code").fill("01234567");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verifying…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resend code", exact: true })).toBeDisabled();
  await expect(page.getByLabel("University email", { exact: true })).toBeDisabled();
  release();
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeEnabled();
});

test("fits a mobile viewport and ignores an invalid prefilled address", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/verify-email?email=outsider%40gmail.com");
  await expect(page.getByLabel("University email", { exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Verify your university email" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/verification-mobile.png", fullPage: true });
});

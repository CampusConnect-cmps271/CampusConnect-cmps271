import { expect, test, type Page } from "@playwright/test";

const email = "student@mail.aub.edu";
async function logIn(page: Page, password: string, address = email) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test("the teammate's login sends an unverified student to code entry without automatically resending", async ({ page, context, request }) => {
  const before = (await (await request.get("http://127.0.0.1:3101/test/resends")).json()).resends;
  await logIn(page, "test-unverified-password", " STUDENT+test@MAIL.AUB.EDU ");
  await expect(page).toHaveURL(/\/verify-email\?email=student%2Btest%40mail.aub.edu$/);
  await expect(page.getByLabel("University email", { exact: true })).toHaveValue("student+test@mail.aub.edu");
  await expect(page.getByLabel("Verification code")).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith("sb-127-auth-token"))).toBe(false);
  expect((await (await request.get("http://127.0.0.1:3101/test/resends")).json()).resends).toBe(before);
  expect(page.url()).not.toContain("password");

  await page.route("**/auth/v1/resend", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ type: "signup", email: "student+test@mail.aub.edu" });
    await route.fulfill({ json: {} });
  });
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("a new code has been requested");

  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const verifiedUser = { id: "00000000-0000-4000-8000-000000000001", email: "student+test@mail.aub.edu", email_confirmed_at: "2026-10-05T12:00:00Z", aud: "authenticated", role: "authenticated" };
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: verifiedUser.id, email: verifiedUser.email, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.route("**/auth/v1/verify", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ email: verifiedUser.email, token: "01234567", type: "email" });
    await route.fulfill({ json: { access_token: token, refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer", user: verifiedUser } });
  });
  await page.getByLabel("Verification code").fill("01234567");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to CampusConnect" }).click();
  await expect(page.getByRole("heading", { name: "Student Profile", exact: true })).toBeVisible();
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Welcome, student+test" })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test("wrong passwords and rate limits stay on login and leave it usable", async ({ page }) => {
  await logIn(page, "test-wrong-password");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
  await page.getByLabel("Password", { exact: true }).fill("test-rate-limit");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Too many attempts");
  await expect(page).toHaveURL(/\/login$/);
});

test("verified students still reach the teammate's protected home", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await logIn(page, "test-verified-password");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Welcome, student" })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith("sb-127-auth-token"))).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  expect(errors).toEqual([]);
});

test("an unexpected unverified sign-in session is cleared and redirected", async ({ page, context }) => {
  await logIn(page, "test-unexpected-unverified-session");
  await expect(page).toHaveURL(/\/verify-email\?email=student%40mail.aub.edu$/);
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith("sb-127-auth-token") && cookie.value)).toBe(false);
});

test("direct unverified sessions cannot enter protected pages or assign roles", async ({ page, context }) => {
  // A synthetic cookie exercises the server guards, even if dashboard email
  // confirmation was disabled. The mock Auth server, not metadata, says no.
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const id = "00000000-0000-4000-8000-000000000002";
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, email, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`,
    refresh_token: "test-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600, token_type: "bearer",
    // Deliberately stale/incorrect: server checks must consult Auth instead.
    user: { id, email, email_confirmed_at: "pretend-confirmed", user_metadata: { email_verified: true } },
  };
  await context.addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  for (const path of ["/home", "/login", "/admin", "/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/verify-email\?email=student%40mail.aub.edu$/);
    await expect(page.getByLabel("Verification code")).toBeVisible();
  }
  const response = await context.request.patch("http://127.0.0.1:3100/api/admin/roles", { data: { userId: id, role: "administrator" } });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: "Email verification required" });
});

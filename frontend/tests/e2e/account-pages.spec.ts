import { expect, test } from "@playwright/test";

test("the current landing page renders without granting admin access to a visitor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Student Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage user roles" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("signed-out protected visits go to login and link to registration", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
  await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("the login form validates required fields and university domains", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText("Email is required", { exact: true })).toBeVisible();
  await expect(page.getByText("Password is required", { exact: true })).toBeVisible();
  await page.getByLabel("University email", { exact: true }).fill("outsider@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText("Use your university email (@mail.aub.edu)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("University email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/login$/);
});

test("password visibility preserves the value and mobile login stays inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("test-only-value");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("test-only-value");
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("verified students log out and lose access to protected home", async ({ page, context }) => {
  await page.goto("/login?next=https%3A%2F%2Fevil.test");
  await page.getByLabel("University email", { exact: true }).fill("student@mail.aub.edu");
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith("sb-127-auth-token") && cookie.value)).toBe(false);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
});

test("registration validates names, password policy and matching confirmation", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("A");
  await page.getByLabel("University email", { exact: true }).fill("student@mail.aub.edu");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password", { exact: true }).fill("different");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText("Name must be at least 2 characters long", { exact: true })).toBeVisible();
  await expect(page.getByText("Passwords do not match", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/register$/);
});

test("the current mock profile validates edits and displays saved local values", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Profile" }).click();
  // The existing mock profile has visual labels without input associations.
  // Select its actual fields without changing the teammate's UI in a test task.
  const fields = page.locator("main input");
  await fields.nth(0).fill("");
  let message = "";
  page.once("dialog", async (dialog) => { message = dialog.message(); await dialog.accept(); });
  await page.getByRole("button", { name: "Save Changes" }).click();
  expect(message).toContain("First Name and Last Name cannot be empty");
  await fields.nth(0).fill("Test Student");
  await fields.nth(3).fill("27");
  page.once("dialog", async (dialog) => { message = dialog.message(); await dialog.accept(); });
  await page.getByRole("button", { name: "Save Changes" }).click();
  expect(message).toContain("valid 4-digit Graduation Year");
  await fields.nth(3).fill("2027");
  page.once("dialog", async (dialog) => { message = dialog.message(); await dialog.accept(); });
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();
  await expect(page.getByText("Test Student", { exact: true })).toBeVisible();
  expect(message).toContain("Mocked");
});

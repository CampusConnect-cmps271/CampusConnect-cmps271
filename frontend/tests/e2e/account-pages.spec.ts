import { expect, test, type Page } from "@playwright/test";

test("the current landing page renders without granting admin access to a visitor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Your campus/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join with your AUB email" })).toBeVisible();
  // A signed-out visitor is offered the auth entry points, not signed-in ones.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Log in", exact: true })).toHaveAttribute("href", "/login");
  await expect(nav.getByRole("link", { name: "Sign up", exact: true })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage user roles" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reset your password" })).toHaveAttribute("href", "/forgot-password");
  expect(errors).toEqual([]);
});

test("signed-out visits to /profile go to login", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  await expect(page.getByRole("link", { name: "Manage user roles" })).toHaveCount(0);
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

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("University email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-verified-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("the profile saves validated edits to the database and fits a phone", async ({ page }) => {
  // SP2-60: its own fixture account, so these edits stay out of other tests.
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, "profile-editor@mail.aub.edu");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Student Profile", exact: true })).toBeVisible();
  // A new profile starts with the name the account signed up with.
  await expect(page.getByText("profile-editor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Full name").fill(" ");
  await page.getByLabel("Graduation year").fill("27");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Full name is required", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a year between 2020 and 2035", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Graduation year")).toHaveValue("27");

  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Major").fill("Computer Science");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByLabel("Bio").fill("Hello from the profile test.");
  await page.getByLabel("Interests").fill("Chess, Python");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.reload();
  await expect(page.getByText("Test Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Computer Science", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Interests" }).getByRole("listitem")).toHaveText(["Chess", "Python"]);

  // The welcome on /home reads the edited profile name.
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Welcome, Test Student" })).toBeVisible();

  // Cancel discards unsaved edits.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Full name").fill("Not Saved");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Test Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Not Saved")).toHaveCount(0);
});

test("students view each other's profiles read-only", async ({ page }) => {
  await logIn(page, "profile-viewer@mail.aub.edu");
  await page.goto("/profile/00000000-0000-4000-8000-000000000004");
  await expect(page.getByRole("heading", { name: "Other Student", exact: true })).toBeVisible();
  await expect(page.getByText("Biology", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toHaveCount(0);
  await expect(page.locator("main input, main textarea")).toHaveCount(0);

  // Your own id opens your editable profile; unknown ids are a 404.
  await page.goto("/profile/00000000-0000-4000-8000-000000000005");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();
  for (const id of ["00000000-0000-4000-8000-0000000000ff", "not-a-profile"]) {
    const response = await page.goto(`/profile/${id}`);
    expect(response?.status()).toBe(404);
  }
});

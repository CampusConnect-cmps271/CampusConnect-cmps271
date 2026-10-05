import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const password = 'NewPass#2026';
async function requestCode(page: Page, email: string) {
  await page.goto('/forgot-password');
  await page.getByLabel('University email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
}
async function fillReset(page: Page, code = '01234567', chosenPassword = password) {
  await page.getByLabel('Reset code', { exact: true }).fill(code);
  await page.getByLabel('New password', { exact: true }).fill(chosenPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(chosenPassword);
}
async function counts(request: APIRequestContext, email: string) {
  return (await request.get(`http://127.0.0.1:3101/test/recovery?email=${encodeURIComponent(email)}`)).json();
}

test('recovery changes the password through real API routes without signing the browser in', async ({ page, context, request }) => {
  const email = 'recovery-success@mail.aub.edu';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('University email', { exact: true }).fill(' RECOVERY-SUCCESS@MAIL.AUB.EDU ');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible();
  await fillReset(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
  expect(await counts(request, email)).toEqual({ requests: 1, verifications: 1, updates: 1, revocations: 1 });
  expect((await context.cookies()).some(cookie => cookie.name.startsWith('sb-127-auth-token') && cookie.value)).toBe(false);

  // Recovery is one-time; replay cannot change the password again.
  const replay = await request.post('/api/auth/reset-password', {
    data: { email, code: '01234567', newPassword: 'AnotherPass#2026', confirmPassword: 'AnotherPass#2026' },
  });
  expect(replay.status()).toBe(400);
  expect((await replay.json()).error).toBe('INVALID_OR_EXPIRED_CODE');
  expect((await counts(request, email)).updates).toBe(1);

  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
  await page.getByLabel('University email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('test-verified-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Incorrect email or password');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(errors).toEqual([]);
});

test('recovery validates input on mobile and never calls Auth for invalid fields', async ({ page, request }) => {
  const email = 'recovery-validation@mail.aub.edu';
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/forgot-password');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByText('Email is required.', { exact: true })).toBeVisible();
  await page.getByLabel('University email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await fillReset(page, '123', 'short');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Passwords do not match.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect((await counts(request, email)).verifications).toBe(0);
  await fillReset(page);
  await page.getByLabel('Show passwords').check();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text');
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveValue(password);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('invalid, expired, throttled and unavailable verification leave recovery usable', async ({ page, request }) => {
  const email = 'recovery-errors@mail.aub.edu';
  await requestCode(page, email);
  for (const [code, message] of [
    ['11111111', 'This reset code is invalid or has expired.'],
    ['22222222', 'This reset code is invalid or has expired.'],
    ['33333333', 'Too many attempts.'],
    ['44444444', 'Password reset is temporarily unavailable.'],
  ]) {
    await fillReset(page, code);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toBeEnabled();
    expect((await counts(request, email)).updates).toBe(0);
  }
  await fillReset(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
});

test('unknown accounts receive the neutral request message and cannot reset', async ({ page }) => {
  await requestCode(page, 'recovery-unknown@mail.aub.edu');
  await expect(page.getByRole('status')).toContainText('If an account exists for that email');
  await fillReset(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('This reset code is invalid or has expired.');
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toHaveCount(0);
});

test('email request throttling and provider failure stay on the request form', async ({ page }) => {
  for (const [email, message] of [
    ['recovery-limit@mail.aub.edu', 'Too many attempts.'],
    ['recovery-unavailable@mail.aub.edu', 'Password reset is temporarily unavailable.'],
  ]) {
    await requestCode(page, email);
    await expect(page.locator('main').getByRole('alert')).toContainText(message);
    await expect(page.getByRole('heading', { name: 'Forgot your password?', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset code', exact: true })).toBeEnabled();
  }
});

test('provider password rejection requires a fresh code and the student can resend', async ({ page, request }) => {
  const email = 'recovery-resend@mail.aub.edu';
  await requestCode(page, email);
  await fillReset(page, '01234567', 'LeakedPass#2026');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('This password is too weak or commonly used.');
  expect((await counts(request, email)).updates).toBe(0);
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Use the most recent code');
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue('');
  await fillReset(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
  expect((await counts(request, email)).requests).toBe(2);
});

test('changing email clears the old recovery fields and request failures remain retryable', async ({ page }) => {
  await requestCode(page, 'recovery-change@mail.aub.edu');
  await fillReset(page);
  await page.getByRole('button', { name: 'Use a different email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?', exact: true })).toBeVisible();
  await page.getByLabel('University email', { exact: true }).fill('recovery-change-new@mail.aub.edu');
  await page.route('**/api/auth/forgot-password', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Could not reach the server.');
  await expect(page.getByRole('button', { name: 'Send reset code', exact: true })).toBeEnabled();
  await page.unroute('**/api/auth/forgot-password');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue('');
  // A password entered for one account must not carry over to another.
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveValue('');
});

test('pending recovery requests disable edits and switching accounts until completion', async ({ page }) => {
  let release: () => void = () => {};
  let wait = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/forgot-password');
  await page.getByLabel('University email', { exact: true }).fill('recovery-pending@mail.aub.edu');
  await page.route('**/api/auth/forgot-password', async route => {
    await wait;
    await route.fulfill({ json: { message: 'If an account exists for that email, a password reset code has been sent.' } });
  });
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByLabel('University email', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible();
  await fillReset(page);
  wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/reset-password', async route => {
    await wait;
    await route.fulfill({ status: 400, json: { error: 'INVALID_OR_EXPIRED_CODE', message: 'This reset code is invalid or has expired.' } });
  });
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  for (const label of ['Reset code', 'New password', 'Confirm new password']) {
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Use a different email', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Resend code', exact: true })).toBeDisabled();
  release();
  await expect(page.locator('main').getByRole('alert')).toContainText('invalid or has expired');
  await expect(page.getByRole('button', { name: 'Use a different email', exact: true })).toBeEnabled();
});

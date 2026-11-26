import { expect, test } from '@playwright/test';

test.describe('auth pages on a 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const path of ['/login', '/register', '/forgot-password']) {
    test(`${path} fits the screen and has a labelled form`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByLabel('University email', { exact: true })).toBeVisible();
    });
  }
});

test('the show/hide password button names its action and does not also claim a pressed state', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Password', { exact: true });
  const toggle = page.getByRole('button', { name: 'Show', exact: true });
  await expect(toggle).not.toHaveAttribute('aria-pressed');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide', exact: true })).not.toHaveAttribute('aria-pressed');
});

test('forgot-password email field asks phones for an email keyboard without auto-capitalising', async ({ page }) => {
  await page.goto('/forgot-password');
  const email = page.getByLabel('University email', { exact: true });
  await expect(email).toHaveAttribute('inputmode', 'email');
  await expect(email).toHaveAttribute('autocapitalize', 'none');
  await expect(email).toHaveAttribute('spellcheck', 'false');
});

test('forgot-password moves focus to the field that needs fixing, then to each new step', async ({ page }) => {
  await page.goto('/forgot-password');

  // Empty submit: focus lands on the invalid email field, not on the button.
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByLabel('University email', { exact: true })).toBeFocused();

  // Next step: focus moves to the new heading instead of being lost.
  await page.getByLabel('University email', { exact: true }).fill('a11y-focus@mail.aub.edu');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeFocused();

  // Mismatched passwords: focus goes to the first invalid field.
  await page.getByLabel('Reset code', { exact: true }).fill('01234567');
  await page.getByLabel('New password', { exact: true }).fill('NewPass#2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByLabel('Confirm new password', { exact: true })).toBeFocused();
});

test('a new-password error is linked to its field for screen readers', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('University email', { exact: true }).fill('a11y-describedby@mail.aub.edu');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await page.getByLabel('Reset code', { exact: true }).fill('01234567');
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByLabel('Confirm new password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();

  const field = page.getByLabel('New password', { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', 'new-password-error password-rules');
  await expect(page.locator('#new-password-error')).toBeVisible();
});

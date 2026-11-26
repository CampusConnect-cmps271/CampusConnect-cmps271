import { expect, test } from '@playwright/test';

test.describe('landing page navigation on a 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the closed menu is out of the tab order and the page does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Open menu' });
    await expect(toggle).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main', includeHidden: true });
    await expect(nav.getByRole('link', { name: 'How it works', exact: true })).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Log in', exact: true })).toBeHidden();
    // Hidden links must not be keyboard-focusable either.
    await expect(nav.locator('a')).toHaveCount(4);
    expect(await nav.locator('a').evaluateAll((links) => links.some((l) => getComputedStyle(l).visibility !== 'hidden'))).toBe(false);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the toggle is a comfortable touch target', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByRole('button', { name: 'Open menu' }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('Escape closes the menu and returns focus to the toggle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Sign up', exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    await expect(nav.getByRole('link', { name: 'Sign up', exact: true })).toBeHidden();
  });

  test('tapping outside the header closes the menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();

    await page.mouse.click(180, 700);
    await expect(nav.getByRole('link', { name: 'Log in', exact: true })).toBeHidden();
  });

  test('choosing an in-page link closes the menu and the section is not hidden under the header', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'FAQ', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page).toHaveURL(/#faq$/);
    await expect
      .poll(async () => page.evaluate(() => document.getElementById('faq')!.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(60);
  });

  test('the menu keeps working by keyboard: Tab reaches the links once it is open', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Open menu' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works', exact: true })).toBeFocused();
  });
});

test.describe('landing page navigation on desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows the links inline with no menu toggle', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /menu/i })).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'How it works', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Sign up', exact: true })).toBeVisible();
  });
});

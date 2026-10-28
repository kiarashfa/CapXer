import { test, expect } from './fixtures.ts';

test.describe('consent banner', () => {
  test('shows on first visit and loads nothing before a choice', async ({ page, gaRequests }) => {
    await page.goto('./');
    await expect(page.getByTestId('consent-banner')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(gaRequests).toHaveLength(0);
  });

  test('decline: no analytics now or after reload', async ({ page, gaRequests }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Decline' }).click();
    await expect(page.getByTestId('consent-banner')).toBeHidden();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('consent-banner')).toBeHidden();
    expect(gaRequests).toHaveLength(0);
  });

  test('accept: loads analytics, and again on the next page without asking', async ({ page, gaRequests }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await expect(page.getByTestId('consent-banner')).toBeHidden();
    await expect.poll(() => gaRequests.length).toBeGreaterThan(0);

    const before = gaRequests.length;
    await page.goto('about/');
    await expect(page.getByTestId('consent-banner')).toBeHidden();
    await expect.poll(() => gaRequests.length).toBeGreaterThan(before);
  });

  test('privacy settings reopens the banner and lets you withdraw', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await page.getByRole('contentinfo').getByRole('button', { name: 'Privacy settings' }).click();
    const banner = page.getByTestId('consent-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toBeFocused();
    await banner.getByRole('button', { name: 'Decline' }).click();
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['ga-disable-G-W290FFPWK4'])).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem('capxer.consent'));
    expect(JSON.parse(stored ?? '{}').analytics).toBe('denied');
  });
});

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// One answer for every project on the origin, stored under this key (src/lib/consent.ts).
const KEY = 'kfa-consent';
const GTAG = 'https://www.googletagmanager.com/gtag/js?id=G-W290FFPWK4';

const bar = (page: Page) => page.locator('[data-consent]');
const stored = async (page: Page) =>
  JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY)) ?? 'null');

/** Localhost never reports; the debug flag lets a test see the Google request. */
async function allowLocalReports(page: Page) {
  await page.addInitScript(() => localStorage.setItem('kfa-consent-debug', '1'));
}

test.describe('cookie bar', () => {
  test('shows on first visit and loads nothing before a choice', async ({ page, gaRequests }) => {
    await allowLocalReports(page);
    await page.goto('./');
    await expect(bar(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(gaRequests).toHaveLength(0);
  });

  test('reject: no analytics now or after reload', async ({ page, gaRequests }) => {
    await allowLocalReports(page);
    await page.goto('./');
    await bar(page).getByRole('button', { name: 'Reject' }).click();
    await expect(bar(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ v: 1, analytics: 'denied' });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(bar(page)).toBeHidden();
    expect(gaRequests).toHaveLength(0);
  });

  test('accept on localhost without the debug flag stores the answer and reports nothing', async ({
    page,
    gaRequests,
  }) => {
    await page.goto('./');
    await bar(page).getByRole('button', { name: 'Accept' }).click();
    await expect(bar(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ v: 1, analytics: 'granted' });
    await page.waitForLoadState('networkidle');
    expect(gaRequests).toHaveLength(0);
  });

  test('accept: loads analytics with only the page path, and again after reload', async ({
    page,
    gaRequests,
  }) => {
    await allowLocalReports(page);
    await page.goto('about/?ref=test#credits');
    await bar(page).getByRole('button', { name: 'Accept' }).click();
    await expect(bar(page)).toBeHidden();
    await expect.poll(() => gaRequests).toContain(GTAG);
    const locations = await page.evaluate(() =>
      (window.dataLayer ?? [])
        .map((entry) => Array.from(entry as ArrayLike<unknown>))
        .filter((args) => args[0] === 'event' && args[1] === 'page_view')
        .map((args) => (args[2] as { page_location: string }).page_location),
    );
    expect(locations.length).toBeGreaterThan(0);
    for (const l of locations) expect(l).toMatch(/^http:\/\/localhost:\d+\/CapXer\/about\/$/);

    const before = gaRequests.length;
    await page.reload();
    await expect(bar(page)).toBeHidden();
    await expect.poll(() => gaRequests.length).toBeGreaterThan(before);
  });

  test('cookie settings reopens the bar and lets you withdraw', async ({ page }) => {
    await allowLocalReports(page);
    await page.goto('./');
    await bar(page).getByRole('button', { name: 'Accept' }).click();
    await expect(bar(page)).toBeHidden();
    await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click();
    await expect(bar(page)).toBeVisible();
    const reject = bar(page).getByRole('button', { name: 'Reject' });
    await expect(reject).toBeFocused();
    await reject.click();
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>)['ga-disable-G-W290FFPWK4'],
      ),
    ).toBe(true);
    expect(await stored(page)).toMatchObject({ analytics: 'denied' });
  });

  test('notes at the bottom of the screen sit above the bar while it shows', async ({ page }) => {
    await page.goto('./');
    await expect(bar(page)).toBeVisible();
    const offset = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--toasts-bottom'));
    await expect.poll(offset).toMatch(/^\d+(\.\d+)?px$/);
    const [barTop, toastsBottom] = await page.evaluate(() => [
      document.querySelector('[data-consent]')!.getBoundingClientRect().top,
      document.getElementById('toasts')!.getBoundingClientRect().bottom,
    ]);
    expect(toastsBottom).toBeLessThanOrEqual(barTop);
    await bar(page).getByRole('button', { name: 'Reject' }).click();
    await expect(bar(page)).toBeHidden();
    await expect.poll(offset).toBe('');
  });
});

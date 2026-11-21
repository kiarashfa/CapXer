import { test, expect } from './fixtures.ts';
import { BASE_PATH } from '../../src/config/site.ts';

// Installable app and offline use (P6). The other suites block service workers
// so request stubbing stays reliable; this one lets them run.

test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('the manifest makes an installable app that opens on the viewfinder', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${BASE_PATH}manifest.webmanifest`);
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'CapXer', start_url: `${BASE_PATH}viewfinder/`, scope: BASE_PATH, display: 'standalone' });
  const purposes = m.icons.map((i: { purpose: string }) => i.purpose);
  expect(purposes).toContain('maskable');
  for (const icon of m.icons) {
    const r = await request.get(icon.src.replace(BASE_PATH, ''));
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(apple!.replace(BASE_PATH, ''))).ok()).toBe(true);
});

test('after one visit, every page works offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright drives service workers and offline mode in Chromium');
  await page.goto('viewfinder/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit installs the worker; the page is controlled from the next load.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  for (const path of ['./', 'about/', 'user/', 'lessons/', 'lessons/aspect-ratios/', 'viewfinder/']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  // The viewfinder still runs: data, optics and fonts are all cached.
  await expect(page.getByTestId('vf-stage')).toHaveAttribute('aria-label', /ALEXA 35/);
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Figtree Variable"');
  });
  expect(fontsOk).toBe(true);
  // An unknown address offline shows the normal 404 page.
  await page.goto('no-such-page/');
  await expect(page.locator('main')).toContainText(/not found|404/i);
  await context.setOffline(false);
});

test('no install button until the browser offers one', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('[data-install]').first()).toBeHidden();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  const visible = page.locator('[data-install]:visible');
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(visible).toHaveCount(1);
    await visible.click();
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(visible).toHaveCount(1);
    await visible.click();
  }
  await expect(page.locator('[data-install]:visible')).toHaveCount(0);
});

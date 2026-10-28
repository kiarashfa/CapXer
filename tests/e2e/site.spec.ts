import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.ts';
import { builtRoutes } from './routes.ts';

const PAGES = builtRoutes();

test.describe('theme', () => {
  test('defaults to dark when the system has no light preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('follows a light system preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('toggle switches and persists across pages', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAccessibleName('Switch to light theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.goto('about/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to dark theme');
  });
});

test.describe('pages', () => {
  for (const path of PAGES) {
    test(`${path} keeps internal links under the base path`, async ({ page }) => {
      await page.goto(path);
      const hrefs = await page.locator('a[href^="/"], link[href^="/"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('href') ?? ''),
      );
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) expect(h.startsWith('/CapXer/')).toBe(true);
    });
  }

  // Astro's HTML compression drops a line break between text and an inline element,
  // gluing words together ("in the<a>"). Write {' '} before such elements.
  for (const path of PAGES) {
    test(`${path} has no words glued to links or buttons`, async ({ page }) => {
      await page.goto(path);
      const html = await page.locator('main').innerHTML();
      expect(html.match(/[A-Za-z0-9,.:;!?]<(a|button|code|strong|em)\b[^>]*>.{0,30}/g) ?? []).toEqual([]);
    });
  }

  test('unknown pages get the 404 page', async ({ page }) => {
    const res = await page.goto('does-not-exist/');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Out of frame');
  });
});

test.describe('accessibility (WCAG 2.2 AA)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    for (const path of PAGES) {
      test(`${path} in ${scheme} theme`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByTestId('consent-banner')).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      });
    }
  }
});

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
      // Lesson citations are raised numbers joined by commas ("6,1") on purpose.
      const glued = (html.match(/[A-Za-z0-9,.:;!?]<(a|button|code|strong|em)\b[^>]*>.{0,30}/g) ?? []).filter((m) => !/class="cite"/.test(m));
      expect(glued).toEqual([]);
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

test.describe('old browsers', () => {
  test('a modern browser sees no old-browser note', async ({ page }) => {
    await page.goto('viewfinder/');
    await expect(page.locator('html')).not.toHaveAttribute('data-old', '');
    await expect(page.getByTestId('old-browser')).toBeHidden();
    await expect(page.getByTestId('vf-stage')).toBeVisible();
  });

  test('a browser missing a needed feature gets a plain note and no broken viewfinder', async ({ page }) => {
    // Stand-in for an old browser: remove one ES2022-era built-in before any page script runs.
    await page.addInitScript(() => {
      // @ts-expect-error test-only removal
      delete window.structuredClone;
    });
    await page.goto('viewfinder/');
    await expect(page.locator('html')).toHaveAttribute('data-old', '');
    const note = page.getByTestId('old-browser');
    await expect(note).toBeVisible();
    await expect(note).toContainText('too old');
    await expect(note).toContainText('viewfinder is switched off');
    await expect(page.getByTestId('vf-stage')).toBeHidden();
    await page.goto('about/');
    await expect(page.getByTestId('old-browser')).toBeVisible();
    await expect(page.getByTestId('old-browser')).not.toContainText('viewfinder');
  });
});

test.describe('findable', () => {
  test('the sitemap lists every built page except 404', async ({ request }) => {
    const xml = await (await request.get('sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    const expected = PAGES.filter((p) => p !== '404.html').map((p) => `/CapXer/${p === './' ? '' : p}`);
    expect(locs.sort()).toEqual(expected.sort());
  });

  test('robots.txt points to the sitemap', async ({ request }) => {
    const txt = await (await request.get('robots.txt')).text();
    expect(txt).toContain('Sitemap: https://kiarashfa.github.io/CapXer/sitemap.xml');
  });

  test('pages carry a social preview image that exists', async ({ page, request }) => {
    await page.goto('./');
    const img = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(img).toBe('https://kiarashfa.github.io/CapXer/social-card.png');
    const res = await request.get('social-card.png');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  });
});

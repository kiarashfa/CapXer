import { test, expect, setSource } from './fixtures.ts';
import type { Page } from '@playwright/test';
import { builtRoutes } from './routes.ts';

// Every page loads without console errors or warnings, uncaught exceptions or
// Content Security Policy violations (the CSP <meta> comes from astro.config.ts).
const PAGES = builtRoutes();

async function watch(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP blocked ${e.blockedURI || 'inline'} (${e.violatedDirective})`);
    });
  });
  page.on('console', (m) => {
    // The test config blocks service workers (pwa.spec.ts covers them); that note is ours, not the site's.
    if (/Service Worker registration blocked by Playwright/.test(m.text())) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  return problems;
}

test.describe('console stays clean', () => {
  for (const path of PAGES) {
    test(`${path} with analytics allowed`, async ({ page, gaRequests }) => {
      const problems = await watch(page);
      await page.goto(path);
      await page.getByRole('button', { name: 'Allow analytics' }).click();
      await expect.poll(() => gaRequests.length).toBeGreaterThan(0);
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });
  }

  test('viewfinder live camera and photo', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit has no fake camera; getUserMedia is stubbed elsewhere');
    const problems = await watch(page);
    await page.goto('viewfinder/');
    await setSource(page, 'live');
    await page.getByRole('button', { name: 'Turn on camera' }).first().click();
    await expect(page.getByTestId('vf-video')).toBeVisible();
    await expect(page.getByTestId('vf-mode')).toBeVisible();
    await page.waitForTimeout(500);
    expect(problems).toEqual([]);
  });
});

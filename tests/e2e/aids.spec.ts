import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.ts';

// Exposure aids (P5). The panel works everywhere; the aids themselves need
// the live camera, so they run on Chromium's fake webcam (a moving test pattern).

async function openExposurePane(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('tab', { name: 'Exposure' }).click();
  } else {
    await page.getByRole('button', { name: 'Show page tools' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#dock-tools').getByRole('button', { name: 'Exposure', exact: true }).click();
  }
  const pane = page.getByTestId('pane-exposure');
  await expect(pane).toBeVisible();
  return pane;
}

async function turnOn(page: Page) {
  await page.getByTestId('vf-live').click();
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await expect(page.getByTestId('vf-video')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('the Exposure panel says the aids need Live, and keeps the choices', async ({ page, isMobile }) => {
  await page.goto('viewfinder/');
  const pane = await openExposurePane(page, isMobile);
  await expect(pane).toContainText('Switch to Live');
  await pane.getByTestId('aid-falseColour').click();
  await expect(pane.getByTestId('aid-legend')).toContainText('Middle grey');
  await expect(pane.getByTestId('aid-legend')).toContainText('37-45 %');
  // Nothing is drawn on the drawn scene.
  await expect(page.getByTestId('vf-aids')).toHaveCount(0);
});

test('the phone tab row fits all seven tools', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'tabs are the phone layout');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('viewfinder/');
  const overflow = await page.locator('.vf-tabs').evaluate((el) => [...el.children].some((b) => b.scrollWidth > b.clientWidth + 1));
  expect(overflow).toBe(false);
});

test.describe('with the fake webcam', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'only Chromium has a fake camera');

  test('histogram shows the framed area and follows the brightness/RGB choice', async ({ page, isMobile }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    const pane = await openExposurePane(page, isMobile);
    await pane.getByTestId('aid-histogram').check();
    const hist = page.getByTestId('vf-hist');
    await expect(hist).toBeVisible();
    await expect(hist.locator('path.luma')).toHaveCount(1);
    await pane.getByRole('button', { name: 'RGB' }).click();
    await expect(hist.locator('path.ch')).toHaveCount(3);
  });

  test('zebras, false colour and peaking draw over the video at its own resolution', async ({ page, isMobile }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    const pane = await openExposurePane(page, isMobile);
    await pane.getByTestId('aid-zebras').click();
    const layer = page.getByTestId('vf-aids');
    await expect(layer).toHaveAttribute('data-mode', 'zebras');
    // The canvas takes the video's size once the first frame is drawn.
    await expect
      .poll(() => page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="vf-aids"]');
        const v = document.querySelector<HTMLVideoElement>('[data-testid="vf-video"]');
        return !!c && !!v && v.videoWidth > 0 && Math.abs(c.width / c.height - v.videoWidth / v.videoHeight) < 0.01;
      }))
      .toBe(true);
    await pane.getByTestId('aid-falseColour').click();
    await expect(layer).toHaveAttribute('data-mode', 'falseColour');
    await pane.getByTestId('aid-peaking').check();
    await expect(layer).toHaveAttribute('data-peaking', 'true');
    await pane.getByTestId('aid-off').click();
    await expect(layer).toHaveAttribute('data-mode', 'off');
    await pane.getByTestId('aid-peaking').uncheck();
    await expect(layer).toHaveCount(0);
  });

  test('full view has its own aids menu, closed with Esc before full view closes', async ({ page }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    await page.getByRole('button', { name: 'Full view' }).click();
    const button = page.getByRole('button', { name: 'Exposure aids' });
    await button.click();
    const menu = page.locator('#vf-full-aids-menu');
    await menu.getByRole('button', { name: 'Histogram' }).click();
    await expect(page.getByTestId('vf-hist')).toBeVisible();
    await menu.getByRole('button', { name: /Zebras/ }).click();
    await expect(page.getByTestId('vf-aids')).toHaveAttribute('data-mode', 'zebras');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(page.locator('.vf-page')).toHaveClass(/full/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vf-page')).not.toHaveClass(/full/);
  });

  test('back to the scene removes the aids', async ({ page, isMobile }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    const pane = await openExposurePane(page, isMobile);
    await pane.getByTestId('aid-histogram').check();
    await pane.getByTestId('aid-zebras').click();
    await expect(page.getByTestId('vf-aids')).toBeVisible();
    await page.getByRole('button', { name: 'Scene', exact: true }).first().click();
    await expect(page.getByTestId('vf-aids')).toHaveCount(0);
    await expect(page.getByTestId('vf-hist')).toHaveCount(0);
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`the Exposure panel with every aid on passes accessibility checks (${scheme})`, async ({ page, isMobile }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('viewfinder/');
      await turnOn(page);
      const pane = await openExposurePane(page, isMobile);
      await pane.getByTestId('aid-histogram').check();
      await pane.getByTestId('aid-falseColour').click();
      await pane.getByTestId('aid-peaking').check();
      await expect(page.getByTestId('vf-hist')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    });
  }
});

import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.ts';

// Live camera (P4). Chromium projects use the browser's fake webcam; every
// project covers the refused and missing camera paths with a stubbed
// getUserMedia, since WebKit has no fake camera.

async function openLivePane(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('tab', { name: 'Live' }).click();
  } else {
    await page.getByRole('button', { name: 'Show page tools' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#dock-tools').getByRole('button', { name: 'Live', exact: true }).click();
  }
  await expect(page.getByTestId('pane-live')).toBeVisible();
}

function stubCamera(page: Page, error: string) {
  // Playwright's WebKit on some platforms has no mediaDevices at all, so the stub provides it.
  return page.addInitScript((name) => {
    const fail = () => Promise.reject(new DOMException('stub', name));
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = fail;
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: fail, enumerateDevices: async () => [] } });
  }, error);
}

async function turnOn(page: Page) {
  await page.getByTestId('vf-live').click();
  await page.getByRole('button', { name: 'Turn on camera' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('Live explains before the browser asks, and Back returns to the scene', async ({ page }) => {
  await page.goto('viewfinder/');
  await page.getByTestId('vf-live').click();
  const card = page.getByTestId('vf-live-card');
  await expect(card).toHaveAttribute('data-status', 'off');
  await expect(card).toContainText('nothing is uploaded');
  await card.getByRole('button', { name: 'Back to scene' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.vf-scene')).toBeVisible();
});

test('a refused camera says how to fix it', async ({ page }) => {
  await stubCamera(page, 'NotAllowedError');
  await page.goto('viewfinder/');
  await turnOn(page);
  const card = page.getByTestId('vf-live-card');
  await expect(card).toHaveAttribute('data-status', 'denied');
  await expect(card).toContainText('Camera blocked');
  await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('no camera is reported plainly', async ({ page }) => {
  await stubCamera(page, 'NotFoundError');
  await page.goto('viewfinder/');
  await turnOn(page);
  await expect(page.getByTestId('vf-live-card')).toContainText('No camera found');
});

test('calibration can be typed in', async ({ page, isMobile }) => {
  await page.goto('viewfinder/');
  await openLivePane(page, isMobile);
  const pane = page.getByTestId('pane-live');
  await pane.getByTestId('calibration-input').fill('24');
  await pane.getByRole('button', { name: 'Use', exact: true }).click();
  // 24 mm equivalent on a 4:3 phone sensor: 71.6 degrees across.
  await expect(pane.getByTestId('calibration-result')).toContainText('24.0 mm');
  await expect(pane.getByTestId('calibration-result')).toContainText('71.6°');
});

test('a device from the list calibrates the camera', async ({ page, isMobile }) => {
  await page.goto('viewfinder/');
  await openLivePane(page, isMobile);
  await page.getByTestId('device-picker').click();
  const dialog = page.getByTestId('device-dialog');
  await dialog.getByRole('searchbox').fill('iphone 17');
  await dialog.getByRole('button', { name: /Apple iPhone 17/ }).click();
  await expect(page.getByTestId('calibration-result')).toContainText('26.0 mm');
  await expect(page.getByTestId('pane-live').getByRole('button', { name: 'Ultra Wide' })).toBeVisible();
});

test.describe('with the fake webcam', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'only Chromium has a fake camera');

  test('shows the video, the active mode, and saves a photo', async ({ page }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    await expect(page.getByTestId('vf-video')).toBeVisible();
    await expect(page.getByTestId('vf-mode')).toHaveAttribute('data-mode', /camera|digital|wider/);
    await expect(page.getByTestId('vf-stage')).toHaveAttribute('aria-label', /live camera/);

    const download = page.waitForEvent('download');
    await page.getByTestId('vf-capture').first().click();
    expect((await download).suggestedFilename()).toMatch(/^capxer-\d{8}-\d{6}\.jpg$/);
  });

  test('a longer lens needs more zoom', async ({ page }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    const mode = page.getByTestId('vf-mode');
    await expect(mode).toBeVisible();
    // The last number in the label is the remaining digital (or camera) factor; the total grows either way.
    const total = async () => {
      const nums = [...((await mode.textContent()) ?? '').matchAll(/([\d.]+)x/g)].map((m) => Number(m[1]));
      return nums.reduce((a, b) => a * b, 1);
    };
    await expect.poll(total).toBeGreaterThan(0);
    const before = await total();
    await page.getByRole('button', { name: 'Full view' }).click();
    await page.getByRole('button', { name: 'Longer focal length' }).click();
    await page.getByRole('button', { name: 'Longer focal length' }).click();
    await expect.poll(total).toBeGreaterThan(before);
  });

  test('full view opens and Esc closes it', async ({ page }) => {
    await page.goto('viewfinder/');
    await turnOn(page);
    await page.getByRole('button', { name: 'Full view' }).click();
    await expect(page.locator('.vf-page')).toHaveClass(/full/);
    await expect(page.getByRole('button', { name: 'Close full view' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.vf-page')).not.toHaveClass(/full/);
    await expect(page.getByRole('button', { name: 'Full view' })).toBeFocused();
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`the live view and its panel pass accessibility checks (${scheme})`, async ({ page, isMobile }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('viewfinder/');
      await turnOn(page);
      await expect(page.getByTestId('vf-video')).toBeVisible();
      await openLivePane(page, isMobile);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    });
  }
});

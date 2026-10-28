import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// The viewfinder: phone/tablet uses tabs, desktop opens the same panes from the
// site bar's dock. Defaults: ALEXA 35, 4K 16:9, 2.39:1, 35 mm.

// Keyboard path: a mouse click first hovers the handle, which already opens the dock.
async function openDock(page: Page) {
  await page.getByRole('button', { name: 'Show page tools' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.site-bar')).toHaveAttribute('data-dock', 'open');
}

async function openPane(page: Page, name: string, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('tab', { name }).click();
  } else {
    const bar = page.locator('.site-bar');
    if ((await bar.getAttribute('data-dock')) !== 'open') await openDock(page);
    const tools = page.locator('#dock-tools');
    // In the dock, the lens panel opens from the focal-length value.
    await (name === 'Lens' ? tools.getByRole('button', { name: /lens settings/ }) : tools.getByRole('button', { name, exact: true })).click();
  }
  await expect(page.getByTestId(`pane-${name.toLowerCase()}`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
  await page.goto('viewfinder/');
});

test('shows the default frame and its angles', async ({ page }) => {
  await expect(page.getByTestId('vf-stage')).toHaveAttribute('aria-label', /ARRI ALEXA 35, 4K 16:9, 35 mm lens, 2\.39:1 frame/);
  await expect(page.locator('main')).toContainText('39.2°');
  await expect(page.locator('main')).toContainText('16.9°');
});

test('a lens stop changes the angle of view', async ({ page, isMobile }) => {
  await openPane(page, 'Lens', isMobile);
  await page.getByTestId('pane-lens').getByRole('button', { name: '50', exact: true }).click();
  // 24.9 mm wide at 50 mm: 2 * atan(24.9 / 100) = 28.0 degrees.
  await expect(page.locator('main')).toContainText('28.0°');
});

test('the camera picker searches and switches camera', async ({ page, isMobile }) => {
  await openPane(page, 'Camera', isMobile);
  await page.getByTestId('camera-picker').click();
  const dialog = page.getByTestId('camera-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('nikon');
  await expect(dialog.getByRole('button', { name: /ALEXA/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Nikon Z6III/ }).click();
  await expect(dialog).toBeHidden();
  // 35.9 mm wide at 35 mm: 54.3 degrees.
  await expect(page.locator('main')).toContainText('54.3°');
});

test('stills mode swaps the frame presets', async ({ page, isMobile }) => {
  await openPane(page, 'Camera', isMobile);
  await page.getByTestId('pane-camera').getByRole('button', { name: 'Stills' }).click();
  await openPane(page, 'Frame', isMobile);
  const frame = page.getByTestId('pane-frame');
  await expect(frame.getByRole('button', { name: '3:2' })).toBeVisible();
  await expect(frame.getByRole('button', { name: '2.39' })).toHaveCount(0);
  // 2.39 does not exist in stills, so the frame falls back to the full format.
  await expect(frame.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true');
});

test('a custom sensor can be added and is used', async ({ page, isMobile }) => {
  await openPane(page, 'Camera', isMobile);
  const pane = page.getByTestId('pane-camera');
  await pane.getByRole('button', { name: 'Add' }).click();
  await pane.getByLabel('Name').fill('Test back');
  await pane.getByLabel('Width (mm)').fill('36');
  await pane.getByLabel('Height (mm)').fill('24');
  await pane.getByRole('button', { name: 'Use this sensor' }).click();
  await expect(page.getByTestId('camera-picker')).toContainText('Test back');
  // 36 mm wide at 35 mm: 54.4 degrees.
  await expect(page.locator('main')).toContainText('54.4°');
});

test.describe('desktop dock', () => {
  test.skip(({ isMobile }) => isMobile, 'the dock is desktop-only');

  test('opens, shows a panel, and Esc closes panel then dock', async ({ page }) => {
    const bar = page.locator('.site-bar');
    await expect(bar).toHaveAttribute('data-dock', 'closed');
    await expect(page.locator('#dock-tools')).toBeHidden();
    await openDock(page);
    // Keyboard users land on the first tool.
    await expect(page.locator('#dock-tools').getByRole('button', { name: 'Camera', exact: true })).toBeFocused();
    await page.locator('#dock-tools').getByRole('button', { name: 'Guides', exact: true }).click();
    await expect(page.getByTestId('pane-guides')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pane-guides')).toBeHidden();
    await expect(bar).toHaveAttribute('data-dock', 'open');
    await page.keyboard.press('Escape');
    await expect(bar).toHaveAttribute('data-dock', 'closed');
  });

  test('hovering the handle opens the dock', async ({ page }) => {
    // Move the mouse there directly: the handle steps aside as soon as it is hovered.
    const box = (await page.getByRole('button', { name: 'Show page tools' }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.site-bar')).toHaveAttribute('data-dock', 'open');
  });

  test('the pin keeps the dock open across pages', async ({ page }) => {
    await openDock(page);
    await page.getByRole('button', { name: 'Keep page tools open' }).click();
    await page.goto('about/');
    await expect(page.locator('.site-bar')).toHaveAttribute('data-dock', 'open');
    await expect(page.locator('#dock-tools').getByRole('link', { name: 'Credits' })).toBeVisible();
  });
});

test.describe('phone menu', () => {
  test.skip(({ isMobile }) => !isMobile, 'the menu is for phone and tablet');

  test('lists the pages', async ({ page }) => {
    await page.getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('navigation', { name: 'Pages' });
    await expect(menu.getByRole('link', { name: 'Viewfinder' })).toHaveAttribute('aria-current', 'page');
    await menu.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/about\/$/);
  });
});

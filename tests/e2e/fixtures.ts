import { test as base, expect, type Page } from '@playwright/test';

/** Every request to Google's analytics hosts is stubbed and recorded; tests never reach the network. */
export const test = base.extend<{ gaRequests: string[] }>({
  gaRequests: async ({ page }, use) => {
    const seen: string[] = [];
    await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    });
    await use(seen);
  },
});

export { expect };

const DESKTOP_MIN = 1024;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN;

/** Opens the desktop dock from the keyboard (a mouse click first hovers the handle, which already opens it). */
export async function openDock(page: Page) {
  const bar = page.locator('.site-bar');
  if ((await bar.getAttribute('data-dock')) === 'open') return;
  await page.getByRole('button', { name: 'Show page tools' }).focus();
  await page.keyboard.press('Enter');
  await expect(bar).toHaveAttribute('data-dock', 'open');
}

/** Switches between the drawn scene and the live camera: the bar toggle on phone/tablet, the Live tool on desktop. */
export async function setSource(page: Page, source: 'scene' | 'live') {
  if (!isDesktop(page)) {
    await page.getByRole('button', { name: source === 'live' ? 'Live' : 'Scene', exact: true }).first().click();
    return;
  }
  await openDock(page);
  const pane = page.getByTestId('pane-live');
  if (!(await pane.isVisible())) await page.locator('#dock-tools').getByRole('button', { name: 'Live', exact: true }).click();
  await pane.getByTestId(`pane-source-${source}`).click();
}

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, openDock } from './fixtures.ts';

// Saving (P6): restore on reload, saved setups, share links, export/import,
// clearing, and storage that the browser refuses.

const DESKTOP_MIN = 1024;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN;

async function openPane(page: Page, id: 'lens' | 'saved' | 'frame') {
  const pane = page.getByTestId(`pane-${id}`);
  if (await pane.isVisible()) return pane;
  if (isDesktop(page)) {
    await openDock(page);
    await page.locator(`#dock-tools [aria-controls="vf-pane-${id}"]`).click();
  } else {
    await page.locator(`#vf-tab-${id}`).click();
  }
  await expect(pane).toBeVisible();
  return pane;
}

const stage = (page: Page) => page.getByTestId('vf-stage');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('the viewfinder comes back as you left it', async ({ page }) => {
  await page.goto('viewfinder/');
  const lens = await openPane(page, 'lens');
  await lens.getByRole('button', { name: '50', exact: true }).click();
  const frame = await openPane(page, 'frame');
  await frame.getByRole('button', { name: '1.85', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /50 mm lens, 1\.85:1 frame/);
  await page.waitForFunction(() => localStorage.getItem('capxer.save')?.includes('"focal":50'));
  await page.reload();
  await expect(stage(page)).toHaveAttribute('aria-label', /50 mm lens, 1\.85:1 frame/);
});

test('save, open, rename and delete a setup (with undo)', async ({ page }) => {
  await page.goto('viewfinder/');
  const saved = await openPane(page, 'saved');
  await expect(saved).toContainText('Nothing saved yet');
  await saved.getByTestId('saved-name').fill('Opening shot');
  await saved.getByRole('button', { name: 'Save', exact: true }).click();
  const list = saved.getByTestId('saved-list');
  await expect(list).toContainText('Opening shot');
  await expect(list).toContainText('Showing');

  // Change the lens: the saved one no longer shows; opening it brings 35 mm back.
  const lens = await openPane(page, 'lens');
  await lens.getByRole('button', { name: '75', exact: true }).click();
  await openPane(page, 'saved');
  await expect(list).not.toContainText('Showing');
  await list.getByRole('button', { name: /Opening shot/ }).first().click();
  await expect(stage(page)).toHaveAttribute('aria-label', /35 mm lens/);

  await page.reload();
  await openPane(page, 'saved');
  await page.getByRole('button', { name: 'More actions for Opening shot' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'New name for Opening shot' }).fill('Wide opener');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(list).toContainText('Wide opener');

  await page.getByRole('button', { name: 'More actions for Wide opener' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(saved).toContainText('Nothing saved yet');
  await page.getByTestId('vf-notice').getByRole('button', { name: 'Undo' }).click();
  await expect(list).toContainText('Wide opener');
});

test('a share link opens the same frame, without losing your own', async ({ page }) => {
  await page.goto('viewfinder/');
  const lens = await openPane(page, 'lens');
  await lens.getByRole('button', { name: '100', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /100 mm lens/);

  await page.goto('viewfinder/#v=1&mode=stills&cam=fujifilm/x-t5&fmt=3-2&ar=1:1&sq=1&mm=23&entry=actual&g=centre&col=red&mask=0.4&d=2');
  await expect(stage(page)).toHaveAttribute('aria-label', /FUJIFILM X-T5.*23 mm lens, 1:1 frame/i);
  const note = page.getByTestId('vf-notice');
  await expect(note).toContainText('Opened a shared setup');
  await expect(page).toHaveURL(/viewfinder\/$/);

  await note.getByRole('button', { name: 'Back to mine' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /ALEXA 35.*100 mm lens/);

  // Again, and this time keep it.
  await page.goto('viewfinder/#v=1&mode=stills&cam=fujifilm/x-t5&fmt=3-2&ar=1:1&sq=1&mm=23&entry=actual&g=&col=red&mask=0.4&d=2');
  await page.getByTestId('vf-notice').getByRole('button', { name: 'Save it' }).click();
  const saved = await openPane(page, 'saved');
  await expect(saved.getByTestId('saved-list')).toContainText('X-T5, 1:1, 23 mm');
});

test('a link to an unknown camera says so and still opens', async ({ page }) => {
  await page.goto('viewfinder/#v=1&mode=cinema&cam=red/raptor&fmt=8k&ar=1.85&mm=40');
  await expect(page.getByTestId('vf-notice')).toContainText('does not know');
  await expect(stage(page)).toHaveAttribute('aria-label', /40 mm lens, 1\.85:1 frame/);
});

test('Share copies a link that opens the same frame', async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'clipboard permission is a desktop Chromium feature in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('viewfinder/');
  const frame = await openPane(page, 'frame');
  await frame.getByRole('button', { name: '4:3', exact: true }).click();
  await page.getByTestId('vf-share').click();
  await expect(page.getByTestId('vf-notice')).toContainText('Link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/CapXer\/viewfinder\/#v=1&mode=cinema&cam=arri\/alexa-35&fmt=4k-16-9&ar=4:3/);

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByTestId('vf-stage')).toHaveAttribute('aria-label', /4:3 frame/);
});

test('export a file and import it into an empty browser', async ({ page, browser }) => {
  await page.goto('viewfinder/');
  const saved = await openPane(page, 'saved');
  await saved.getByTestId('saved-name').fill('Backup me');
  await saved.getByRole('button', { name: 'Save', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), saved.getByTestId('saved-export').click()]);
  expect(download.suggestedFilename()).toMatch(/^capxer-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ app: 'capxer', v: 2, setups: [{ name: 'Backup me' }] });

  const fresh = await browser.newContext({ viewport: page.viewportSize(), isMobile: false });
  const p2 = await fresh.newPage();
  await p2.addInitScript(() => localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' })));
  await p2.goto(page.url());
  const saved2 = await openPane(p2, 'saved');
  await expect(saved2).toContainText('Nothing saved yet');
  await saved2.getByTestId('saved-import').setInputFiles({ name: 'capxer-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const dlg = p2.getByTestId('import-dialog');
  await expect(dlg).toContainText('capxer-backup.json');
  await expect(dlg).toContainText('Saved setups 1');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await expect(saved2.getByTestId('saved-list')).toContainText('Backup me');
  await fresh.close();
});

test('a file that is not a save file is refused politely', async ({ page }) => {
  await page.goto('viewfinder/');
  const saved = await openPane(page, 'saved');
  await saved.getByTestId('saved-import').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByTestId('vf-notice')).toContainText('not a CapXer save file');
  await expect(page.getByTestId('import-dialog')).not.toBeVisible();
});

test('clear all saved data empties this browser', async ({ page }) => {
  await page.goto('viewfinder/');
  const saved = await openPane(page, 'saved');
  await saved.getByTestId('saved-name').fill('Temp');
  await saved.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem('capxer.save')?.includes('Temp'));
  await saved.getByRole('button', { name: 'Clear all saved data' }).click();
  await page.getByTestId('clear-dialog').getByRole('button', { name: 'Clear everything' }).click();
  await expect(saved).toContainText('Nothing saved yet');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('capxer.save'))).toBeNull();
});

test('when the browser refuses storage, everything still works for the page', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.setItem = deny;
  });
  await page.goto('viewfinder/');
  const saved = await openPane(page, 'saved');
  await expect(saved.getByTestId('saved-unavailable')).toBeVisible();
  await saved.getByTestId('saved-name').fill('Session only');
  await saved.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(saved.getByTestId('saved-list')).toContainText('Session only');
});

test('phone tabs: all eight tools are reachable in a scrolling row', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'tabs are the phone layout');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('viewfinder/');
  const tabs = page.locator('.vf-tabs');
  // No label is cut off; the row scrolls instead of squeezing them.
  const cut = await tabs.evaluate((el) => [...el.children].some((b) => b.scrollWidth > b.clientWidth + 1));
  expect(cut).toBe(false);
  await expect(page.getByRole('tab')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Saved' }).click();
  await expect(page.getByTestId('pane-saved')).toBeVisible();
  const inView = await page.getByRole('tab', { name: 'Saved' }).evaluate((b) => {
    const r = b.getBoundingClientRect();
    const row = b.parentElement!.getBoundingClientRect();
    return r.left >= row.left - 1 && r.right <= row.right + 1;
  });
  expect(inView).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  test(`Saved panel and its dialogs pass axe (${theme})`, async ({ page }) => {
    await page.addInitScript((th) => localStorage.setItem('capxer.theme', th), theme);
    await page.goto('viewfinder/');
    const saved = await openPane(page, 'saved');
    await saved.getByTestId('saved-name').fill('Axe check');
    await saved.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('vf-notice')).toBeVisible();
    const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations;
    expect(await scan()).toEqual([]);
    await page.getByRole('button', { name: 'More actions for Axe check' }).click();
    expect(await scan()).toEqual([]);
    await page.keyboard.press('Escape');
    await saved.getByRole('button', { name: 'Clear all saved data' }).click();
    await expect(page.getByTestId('clear-dialog')).toBeVisible();
    expect(await scan()).toEqual([]);
  });
}

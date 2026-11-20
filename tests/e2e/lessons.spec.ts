import type { Page } from '@playwright/test';
import { test, expect, openDock } from './fixtures.ts';

const LESSON = 'lessons/aspect-ratios/';
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

// Consent already answered, so the banner never covers what the tests tap.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('the Lessons page lists the lesson and the bar marks the section', async ({ page }) => {
  await page.goto('lessons/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
  const card = page.locator('.lesson-card').filter({ has: page.getByRole('link', { name: 'Aspect ratios' }) });
  await expect(card).toContainText(/\d+ min read/);
  await expect(card).toContainText(/\d+ sources?/);
  if (isDesktop(page)) await expect(page.locator('.bar-pages').getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'page');
  await card.getByRole('link', { name: 'Aspect ratios' }).click();
  await expect(page).toHaveURL(/lessons\/aspect-ratios\/$/);
  if (isDesktop(page)) await expect(page.locator('.bar-pages').getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'true');
});

test('every citation points at a numbered source, numbered by first appearance', async ({ page }) => {
  await page.goto(LESSON);
  const cites = await page.locator('a.cite').evaluateAll((els) =>
    els.map((a) => ({ n: Number((a as HTMLElement).dataset.source), href: a.getAttribute('href'), text: a.textContent, loc: (a as HTMLElement).dataset.locator })),
  );
  expect(cites.length).toBeGreaterThan(0);
  const sources = await page.locator('.lesson-sources li').count();
  let highest = 0;
  for (const c of cites) {
    expect(c.href).toBe(`#source-${c.n}`);
    expect(c.text?.replaceAll(' ', ' ')).toBe(`[${c.n}, ${c.loc}]`);
    expect(c.n).toBeLessThanOrEqual(highest + 1);
    highest = Math.max(highest, c.n);
    await expect(page.locator(`#source-${c.n}`)).toHaveCount(1);
  }
  expect(highest).toBe(sources);
  // No raw markers survive the build.
  expect(await page.locator('main').innerText()).not.toContain('[@');
  // Every source opens somewhere a reader can check.
  for (const li of await page.locator('.lesson-sources li').all()) await expect(li.getByRole('link', { name: 'Open source' })).toHaveCount(1);
});

test('a citation shows its source: rail on desktop, popover on phone', async ({ page }) => {
  await page.goto(LESSON);
  const cite = page.locator('a.cite').first();
  const n = await cite.getAttribute('data-source');
  const locator = (await cite.getAttribute('data-locator'))!;
  await cite.click();
  if (isDesktop(page)) {
    const entry = page.locator(`#source-${n}`);
    await expect(entry).toHaveClass(/is-active/);
    await expect(entry.locator('.src-at')).toContainText(locator);
    await expect(page.locator('.lesson-sources')).toBeInViewport();
    await expect(page.locator('.cite-pop')).toBeHidden();
  } else {
    const pop = page.getByRole('dialog');
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(locator);
    await expect(pop.getByRole('link', { name: 'Open source' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(cite).toBeFocused();
  }
});

test('Try it opens the viewfinder with that setup, keeping your own', async ({ page }) => {
  await page.goto(LESSON);
  const link = page.locator('.lesson-try a.lesson-trylink').first();
  await expect(link).toHaveAttribute('href', /\/CapXer\/viewfinder\/#v=1&/);
  await link.click();
  await expect(page).toHaveURL(/viewfinder\//);
  const note = page.getByTestId('vf-notice');
  await expect(note).toContainText('Opened a shared setup');
  await expect(note.getByRole('button', { name: 'Back to mine' })).toBeVisible();
});

test('the Frame panel links to the lesson', async ({ page }) => {
  await page.goto('viewfinder/');
  if (isDesktop(page)) {
    await openDock(page);
    await page.locator('#dock-tools').getByRole('button', { name: 'Frame', exact: true }).click();
  } else {
    await page.getByRole('tab', { name: 'Frame' }).click();
  }
  const learn = page.getByTestId('pane-frame').getByRole('link', { name: /Learn: Aspect ratios/ });
  await expect(learn).toBeVisible();
  await learn.click();
  await expect(page).toHaveURL(/lessons\/aspect-ratios\/$/);
});

import type { Page } from '@playwright/test';
import { test, expect, openDock } from './fixtures.ts';

const LESSON = 'lessons/aspect-ratios/';
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

// Consent already answered, so the cookie bar never covers what the tests tap.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kfa-consent', JSON.stringify({ v: 1, analytics: 'denied' }));
  });
});

test('the Lessons page lists the lesson and the bar marks the section', async ({ page }) => {
  await page.goto('lessons/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
  const card = page
    .locator('.lesson-card')
    .filter({ has: page.getByRole('link', { name: 'Aspect ratios' }) });
  await expect(card).toContainText(/\d+ min read/);
  await expect(card).toContainText(/\d+ sources?/);
  if (isDesktop(page))
    await expect(page.locator('.bar-pages').getByRole('link', { name: 'Lessons' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  await card.getByRole('link', { name: 'Aspect ratios' }).click();
  await expect(page).toHaveURL(/lessons\/aspect-ratios\/$/);
  if (isDesktop(page))
    await expect(page.locator('.bar-pages').getByRole('link', { name: 'Lessons' })).toHaveAttribute(
      'aria-current',
      'true',
    );
});

test('the Lessons page card shows the lesson drawing', async ({ page }) => {
  await page.goto('lessons/');
  const art = page.locator('.lesson-card-art svg').first();
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('aria-hidden', 'true');
});

test('citations are raised source numbers, numbered by first appearance', async ({ page }) => {
  await page.goto(LESSON);
  const cites = await page.locator('a.cite').evaluateAll((els) =>
    els.map((a) => ({
      n: Number((a as HTMLElement).dataset.source),
      href: a.getAttribute('href'),
      text: a.textContent,
      loc: (a as HTMLElement).dataset.locator,
      raised: a.parentElement?.tagName === 'SUP',
    })),
  );
  expect(cites.length).toBeGreaterThan(0);
  const sources = await page.locator('.lesson-sources li').count();
  let highest = 0;
  for (const c of cites) {
    expect(c.href).toBe(`#source-${c.n}`);
    expect(c.text).toBe(String(c.n));
    expect(c.raised).toBe(true);
    expect(c.loc).toBeTruthy();
    expect(c.n).toBeLessThanOrEqual(highest + 1);
    highest = Math.max(highest, c.n);
  }
  expect(highest).toBe(sources);
  // Several sources at once read "6,1", never "61".
  for (const html of await page
    .locator('sup.cites')
    .evaluateAll((els) => els.map((e) => e.innerHTML))) {
    expect(html).not.toMatch(/<\/a><a/);
  }
  // No raw markers survive the build.
  expect(await page.locator('main').innerText()).not.toContain('[@');
});

test('sources: one entry per source with every place cited, collapsible and open by default', async ({
  page,
}) => {
  await page.goto(LESSON);
  const box = page.locator('details.lesson-sources');
  await expect(box).toHaveAttribute('open', '');
  const first = page.locator('#source-1');
  await expect(first.getByRole('link', { name: 'Open source' })).toHaveCount(1);
  await expect(first.locator('.src-at')).toContainText(/Cited at: .+/);
  for (const li of await page.locator('.lesson-sources li').all())
    await expect(li.getByRole('link', { name: 'Open source' })).toHaveCount(1);
  // Collapse, then a link into the list opens it again.
  await page.locator('details.lesson-sources > summary').click();
  await expect(first).toBeHidden();
  await page.locator('a.cite').first().click();
  await page.getByRole('dialog').getByRole('link', { name: 'All sources' }).click();
  await expect(box).toHaveAttribute('open', '');
  await expect(first).toBeInViewport();
});

test('a citation opens a popover with the source and the exact place', async ({ page }) => {
  await page.goto(LESSON);
  const cite = page.locator('a.cite').first();
  const locator = (await cite.getAttribute('data-locator'))!;
  await cite.click();
  const pop = page.getByRole('dialog');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(`Cited here: ${locator}`);
  await expect(pop.getByRole('link', { name: 'Open source' })).toBeVisible();
  await expect(cite).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(cite).toBeFocused();
});

test('desktop: the contents list on the left follows the reader', async ({ page }) => {
  test.skip(!isDesktop(page), 'desktop only');
  await page.goto(LESSON);
  const toc = page.getByRole('navigation', { name: 'On this page' });
  await expect(toc).toBeVisible();
  const tocBox = (await toc.boundingBox())!;
  const bodyBox = (await page.locator('.lesson-body').boundingBox())!;
  expect(tocBox.x + tocBox.width).toBeLessThan(bodyBox.x);
  await toc.getByRole('link', { name: 'Cinema containers' }).click();
  await expect(toc.getByRole('link', { name: 'Cinema containers' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(toc).toBeInViewport();
});

test('text size buttons scale the lesson text and are remembered', async ({ page }) => {
  await page.goto(LESSON);
  const size = () =>
    page.locator('.lesson-body').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const base = await size();
  let group;
  if (isDesktop(page)) {
    await openDock(page);
    group = page.locator('#dock-tools').getByRole('group', { name: 'Text size' });
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    group = page.locator('#site-menu').getByRole('group', { name: 'Text size' });
  }
  await group.getByRole('button', { name: 'Larger text' }).click();
  await expect(group.getByRole('button', { name: 'Reset text size' })).toHaveText('113%');
  expect(await size()).toBeCloseTo(base * 1.125, 1);
  await page.reload();
  expect(await size()).toBeCloseTo(base * 1.125, 1);
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

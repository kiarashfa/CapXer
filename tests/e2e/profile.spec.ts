import type { Page, Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, openDock } from './fixtures.ts';

// v1.1: the profile circle, /user/ (save file as the key, picture, sign out)
// and cloud save. Dropbox is stubbed at the network: no test reaches a real cloud.

const DESKTOP_MIN = 1024;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN;

const PROFILE = {
  name: 'Sam Kade',
  picture: null,
  initials: { letters: 'SK', tint: 'teal' },
  changedAt: '2026-01-21T08:00:00.000Z',
};
const save = (extra: Record<string, unknown> = {}) => ({
  app: 'capxer',
  v: 2,
  savedAt: '2026-01-21T08:00:00.000Z',
  current: {},
  setups: [],
  gear: { cameras: [], lenses: [] },
  calibration: {},
  aids: {},
  deleted: {},
  ...extra,
});
const SETUP = (id: string, name: string) => ({
  id,
  name,
  savedAt: '2026-01-21T07:00:00.000Z',
  setup: {
    mode: 'cinema',
    sensorId: 'arri/alexa-35',
    formatId: '4k-16-9',
    aspect: '2.39',
    focal: 40,
  },
});

/** Seeds localStorage once per test (not on every navigation, so sign out stays signed out). */
async function seed(page: Page, items: Record<string, unknown>) {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, JSON.stringify(v));
  }, items);
}

const stored = (page: Page, key = 'capxer.save') =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const circle = (page: Page) => page.getByTestId('profile-button');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kfa-consent', JSON.stringify({ v: 1, analytics: 'denied' }));
  });
});

test('an empty browser shows the ways in, and a new profile appears in the bar on every page', async ({
  page,
}) => {
  await page.goto('user/');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(circle(page).locator('.avatar')).not.toHaveAttribute('data-kind');
  await expect(circle(page).locator('.avatar-dot')).toBeHidden();

  await page.getByTestId('start-fresh').click();
  await page.getByTestId('name-input').fill('  Sam   Kade ');
  await page.getByTestId('name-input').press('Enter');
  await expect(page.getByTestId('profile-name')).toHaveText('Sam Kade');
  // A first name with no picture gets its initials, in the bar too.
  await expect(circle(page).locator('.avatar')).toHaveAttribute('data-kind', 'initials');
  await expect(circle(page)).toHaveAccessibleName(
    /Your profile, Sam Kade, initials SK\. Saved in this browser only/,
  );

  // Painted before first paint on the next page (inline script), then the menu.
  await page.goto('lessons/');
  await expect(circle(page).locator('.avatar-glyph')).toHaveText('SK');
  await circle(page).click();
  const menu = page.getByTestId('profile-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Sam Kade');
  await expect(menu.getByRole('link', { name: 'Your profile' })).toHaveAttribute(
    'href',
    /\/user\/$/,
  );
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(circle(page)).toBeFocused();
});

test('initials and a cropped photo become the profile picture', async ({ page }) => {
  await seed(page, { 'capxer.save': save({ profile: PROFILE }) });
  await page.goto('user/');

  await page.getByTestId('use-initials').click();
  const dlg = page.getByTestId('picture-dialog');
  await dlg.getByTestId('initials-input').fill('kz');
  // The colour swatch covers its radio, as a real user sees it.
  await dlg.locator('label', { has: page.getByRole('radio', { name: 'Violet' }) }).click();
  await expect(dlg.getByRole('radio', { name: 'Violet' })).toBeChecked();
  await dlg.getByTestId('picture-save').click();
  await expect(circle(page).locator('.avatar')).toHaveAttribute('data-tint', 'violet');
  await expect(circle(page).locator('.avatar-glyph')).toHaveText('KZ');

  // A photo: drawn in the page, chosen through the file chooser, stored small.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 600;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c84';
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#248';
    g.fillRect(300, 100, 300, 400);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('upload-photo').click();
  await (
    await chooser
  ).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const crop = page.getByTestId('picture-crop');
  await expect(crop).toBeVisible();
  await crop.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await page.getByTestId('picture-save').click();
  await expect(circle(page).locator('.avatar')).toHaveAttribute('data-kind', 'picture');
  const file = await stored(page);
  expect(file.profile.picture).toMatch(/^data:image\/(webp|jpeg);base64,/);
  expect(file.profile.picture.length).toBeLessThan(80_000);
  expect(file.profile.initials).toEqual({ letters: 'KZ', tint: 'violet' });
});

test('the viewfinder keeps the profile and records deletions when it saves', async ({ page }) => {
  await seed(page, {
    'capxer.save': save({ profile: PROFILE, setups: [SETUP('abc123', 'Old one')] }),
  });
  await page.goto('viewfinder/');
  const pane = page.getByTestId('pane-lens');
  if (isDesktop(page)) {
    await openDock(page);
    await page.locator('#dock-tools [aria-controls="vf-pane-lens"]').click();
  } else {
    await page.locator('#vf-tab-lens').click();
  }
  await pane.getByRole('button', { name: '50', exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem('capxer.save')?.includes('"focal":50'));
  const file = await stored(page);
  expect(file.profile).toEqual(PROFILE);
  expect(file.v).toBe(3);
  expect(file.setups).toHaveLength(1);
});

test('your save file is your key: opening it on an empty browser brings everything back', async ({
  page,
}) => {
  await page.goto('user/');
  const backup = save({
    profile: PROFILE,
    setups: [SETUP('abc123', 'A-cam wide'), SETUP('def456', 'B-cam')],
  });
  await page.getByTestId('open-file-input').setInputFiles({
    name: 'capxer-2026-11-21.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByTestId('profile-note')).toContainText('Welcome back');
  await expect(page.getByTestId('profile-name')).toHaveText('Sam Kade');
  await expect(page.getByTestId('profile-card')).toContainText('2 saved setups');
  await expect(circle(page).locator('.avatar-glyph')).toHaveText('SK');

  // A second file on a browser with work asks how to join them.
  await page.getByTestId('open-file-input').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save({ setups: [SETUP('ghi789', 'C-cam')] }))),
  });
  await page.getByTestId('import-merge').click();
  await expect(page.getByTestId('profile-card')).toContainText('3 saved setups');
});

test('sign out warns when the work is nowhere else, then leaves nothing behind', async ({
  page,
}) => {
  await seed(page, { 'capxer.save': save({ profile: PROFILE, setups: [SETUP('abc123', 'A')] }) });
  await page.goto('about/');
  await circle(page).click();
  await page
    .getByTestId('profile-menu')
    .getByRole('button', { name: 'Sign out of this browser' })
    .click();
  const dlg = page.getByTestId('signout-dialog');
  await expect(dlg).toContainText('Your work is only in this browser');
  await expect(dlg.getByRole('button', { name: 'Download save file' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/user\/$/);
  await expect(page.getByTestId('profile-note')).toContainText('Signed out');
  await expect(page.getByTestId('welcome')).toBeVisible();
  expect(await stored(page)).toBeNull();
  await expect(circle(page).locator('.avatar')).not.toHaveAttribute('data-kind');
});

test.describe('profile page accessibility', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`profile, menu and picture dialog pass axe (${theme})`, async ({ page }) => {
      await seed(page, {
        'capxer.save': save({ profile: PROFILE, setups: [SETUP('abc123', 'A')] }),
      });
      await page.addInitScript((t) => localStorage.setItem('capxer.theme', t), theme);
      await page.goto('user/');
      await expect(page.getByTestId('profile-card')).toBeVisible();
      const axe = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
      expect((await axe()).violations).toEqual([]);
      await circle(page).click();
      expect((await axe()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByTestId('use-initials').click();
      await expect(page.getByTestId('picture-dialog')).toBeVisible();
      expect((await axe()).violations).toEqual([]);
    });
  }
});

/* Cloud save (Dropbox, stubbed) ------------------------------------------------------------ */

interface Cloud {
  remote: { rev: string; body: string } | null;
  uploads: string[];
  revoked: number;
  tokenBodies: string[];
}

async function stubDropbox(page: Page, remote: Cloud['remote'] = null): Promise<Cloud> {
  const cloud: Cloud = { remote, uploads: [], revoked: 0, tokenBodies: [] };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('https://api.dropboxapi.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/oauth2/token') {
      cloud.tokenBodies.push(route.request().postData() ?? '');
      return json(route, 200, {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 14400,
      });
    }
    if (path === '/2/users/get_current_account')
      return json(route, 200, { name: { display_name: 'Sam Kade' }, email: 'sam@example.com' });
    if (path === '/2/files/get_metadata')
      return cloud.remote
        ? json(route, 200, { rev: cloud.remote.rev })
        : json(route, 409, { error_summary: 'path/not_found/' });
    if (path === '/2/auth/token/revoke') {
      cloud.revoked++;
      return json(route, 200, null);
    }
    return json(route, 404, {});
  });
  await page.route('https://content.dropboxapi.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/2/files/download')
      return route.fulfill({ status: 200, body: cloud.remote?.body ?? '' });
    if (path === '/2/files/upload') {
      const body = route.request().postData() ?? '';
      cloud.uploads.push(body);
      cloud.remote = { rev: `r${cloud.uploads.length + 1}`, body };
      return json(route, 200, { rev: cloud.remote.rev });
    }
    return json(route, 404, {});
  });
  return cloud;
}

const connected = (extra: Record<string, unknown> = {}) => ({
  provider: 'dropbox',
  account: { name: 'Sam Kade', email: 'sam@example.com' },
  savedAt: '2026-01-21T08:00:00.000Z',
  rev: 'r1',
  file: null,
  token: { access: 'access-0', expires: Date.now() + 3_600_000 },
  refresh: 'refresh-0',
  problem: null,
  ...extra,
});

test.describe('cloud save', () => {
  test('coming back from Dropbox connects it and uploads the save', async ({ page }) => {
    const cloud = await stubDropbox(page);
    await seed(page, { 'capxer.save': save({ profile: PROFILE }) });
    await page.addInitScript(() =>
      sessionStorage.setItem(
        'capxer.dropboxPkce',
        JSON.stringify({ verifier: 'verifier-1', state: 'state-1' }),
      ),
    );
    await page.goto('user/?code=code-1&state=state-1');
    await expect(page.getByTestId('profile-note')).toContainText('up to date');
    await expect(page).toHaveURL(/\/user\/$/);
    expect(cloud.tokenBodies[0]).toContain('code_verifier=verifier-1');
    expect(cloud.tokenBodies[0]).toContain(
      `redirect_uri=${encodeURIComponent('http://localhost:4321/CapXer/user/')}`,
    );
    expect(cloud.uploads).toHaveLength(1);
    expect(JSON.parse(cloud.uploads[0]!).profile.name).toBe('Sam Kade');
    await expect(page.getByTestId('cloud-card')).toContainText('Saved to Dropbox just now');
    await expect(circle(page).locator('.avatar-dot')).toHaveAttribute('data-dot', 'saved');
    const state = await stored(page, 'capxer.cloud');
    expect(state).toMatchObject({
      provider: 'dropbox',
      refresh: 'refresh-1',
      rev: 'r2',
      account: { email: 'sam@example.com' },
    });
  });

  test('an answer that does not belong to this browser connects nothing', async ({ page }) => {
    await stubDropbox(page);
    await page.goto('user/?code=code-1&state=someone-else');
    await expect(page.getByTestId('profile-note')).toContainText('does not belong to this browser');
    expect(await stored(page, 'capxer.cloud')).toBeNull();
  });

  test('a save from another device is merged in, not overwritten', async ({ page }) => {
    const theirs = save({
      savedAt: '2026-01-21T09:00:00.000Z',
      setups: [SETUP('abc123', 'Mine'), SETUP('zzz999', 'From the laptop')],
    });
    const cloud = await stubDropbox(page, { rev: 'r5', body: JSON.stringify(theirs) });
    await seed(page, {
      'capxer.save': save({ profile: PROFILE, setups: [SETUP('abc123', 'Mine')] }),
      'capxer.cloud': connected(),
    });
    await page.goto('user/');
    await expect(page.getByTestId('profile-card')).toContainText('2 saved setups');
    const file = await stored(page);
    expect(file.setups.map((s: { name: string }) => s.name)).toEqual(['Mine', 'From the laptop']);
    expect(file.profile.name).toBe('Sam Kade');
    // Nothing new here, so nothing was written back.
    expect(cloud.uploads).toHaveLength(0);
    expect(await stored(page, 'capxer.cloud')).toMatchObject({ rev: 'r5' });
  });

  test('changes are saved to the cloud by themselves', async ({ page }) => {
    const cloud = await stubDropbox(page, {
      rev: 'r1',
      body: JSON.stringify(save({ profile: PROFILE })),
    });
    await seed(page, { 'capxer.save': save({ profile: PROFILE }), 'capxer.cloud': connected() });
    await page.goto('user/');
    await expect(page.getByTestId('cloud-card')).toContainText('Saved to Dropbox');
    await page.getByTestId('edit-name').click();
    await page.getByTestId('name-input').fill('Sam K.');
    await page.getByTestId('name-input').press('Enter');
    await expect.poll(() => cloud.uploads.length, { timeout: 10_000 }).toBe(1);
    expect(JSON.parse(cloud.uploads[0]!).profile.name).toBe('Sam K.');
    await expect(circle(page).locator('.avatar-dot')).toHaveAttribute('data-dot', 'saved');
  });

  test('signing out saves first, ends the access and keeps the cloud copy', async ({ page }) => {
    const cloud = await stubDropbox(page, { rev: 'r1', body: JSON.stringify(save()) });
    await seed(page, {
      'capxer.save': save({ profile: PROFILE, savedAt: '2026-01-21T10:00:00.000Z' }),
      'capxer.cloud': connected(),
    });
    await page.goto('user/');
    await page.getByTestId('sign-out').click();
    const dlg = page.getByTestId('signout-dialog');
    await expect(dlg).toContainText('Your save stays in your Dropbox');
    await dlg.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    expect(cloud.uploads.length).toBeGreaterThanOrEqual(1);
    expect(cloud.revoked).toBe(1);
    expect(await stored(page)).toBeNull();
    expect(await stored(page, 'capxer.cloud')).toBeNull();
  });

  test('when Dropbox needs you again the circle says so', async ({ page }) => {
    await stubDropbox(page);
    await seed(page, {
      'capxer.save': save({ profile: PROFILE }),
      'capxer.cloud': connected({ problem: 'auth' }),
    });
    await page.goto('lessons/');
    await expect(circle(page).locator('.avatar-dot')).toHaveAttribute('data-dot', 'auth');
    await expect(circle(page)).toHaveAccessibleName(/Dropbox needs you to connect again/);
    await circle(page).click();
    await expect(
      page.getByTestId('profile-menu').getByRole('button', { name: 'Connect Dropbox again' }),
    ).toBeVisible();
  });
});

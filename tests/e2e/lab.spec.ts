import AxeBuilder from '@axe-core/playwright';
import { expect, openDock, test } from './fixtures.ts';

// The lab (v2, L3): desktop renders the studio by accumulation and shows a
// meter, the settings and a top view of the set; phones get a card instead.

// The analytics banner would cover the lower controls; the consent tests cover it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('capxer.consent', JSON.stringify({ v: 1, analytics: 'denied', at: '' }));
  });
});

test('the site bar links to the lab', async ({ page }) => {
  await page.goto('lab/');
  await expect(page.locator('.bar-pages a[href$="/lab/"], .menu-sheet a[href$="/lab/"]').first()).toHaveAttribute('aria-current', 'page');
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the lab is desktop only');

  test('renders the studio until the picture is finished, then meters it', async ({ page }) => {
    await page.goto('lab/');
    const stage = page.getByTestId('lab-stage');
    await expect(stage.locator('canvas')).toBeVisible();
    await expect(stage).toHaveAttribute('data-done', 'true', { timeout: 60_000 });
    // The default viewfinder setup is Cinema: T-stop, shutter angle, EI.
    await expect(stage).toHaveAttribute('aria-label', /Figure, Three-point, T2\.8, 180° \(1\/48 s at 24 fps\), EI 400, 5600 K/);
    // The meter reads the finished picture.
    await expect(page.locator('.lab-meter')).toHaveAttribute('aria-label', /EV \d+\.\d/, { timeout: 15_000 });
    // Not a blank picture: the screenshot of the stage has real detail.
    expect((await stage.screenshot()).length).toBeGreaterThan(15_000);
  });

  test('shows the settings and a top view with the sharp area', async ({ page }) => {
    await page.goto('lab/');
    await expect(page.getByTestId('lab-aperture-value')).toHaveText('T2.8');
    await expect(page.getByTestId('lab-shutter-value')).toHaveText('180°');
    await expect(page.getByTestId('lab-iso-value')).toHaveText('400');
    await expect(page.getByTestId('lab-wb-value')).toHaveText('5600 K');
    await expect(page.locator('.lab-note')).toContainText('simplified model');
    const plan = page.locator('svg.lab-plan');
    await expect(plan).toHaveAttribute('aria-label', /Figure 4\.\d m from the camera, Key, Fill, Back\. Sharp \d/);
    await expect(plan.locator('polygon.dof')).toHaveCount(1);
    await expect(plan.locator('circle.lamp')).toHaveCount(3);
    await expect(page.locator('.lab-legend')).toContainText('What the lens sees');
  });

  test('ISO and white balance only change how the finished picture is shown', async ({ page }) => {
    await page.goto('lab/');
    const stage = page.getByTestId('lab-stage');
    await expect(stage).toHaveAttribute('data-done', 'true', { timeout: 60_000 });
    await page.getByTestId('lab-iso-more').click();
    await expect(page.getByTestId('lab-iso-value')).toHaveText('500');
    await page.getByTestId('lab-wb-less').click();
    await expect(page.getByTestId('lab-wb-value')).toHaveText('5000 K');
    await expect(stage).toHaveAttribute('data-done', 'true');
    // One third stop more ISO and nothing else: the picture is brighter than the meter asks for.
    await expect(page.locator('.lab-meter')).toHaveAttribute('aria-label', /stops brighter than the meter/);
  });

  test('aperture restarts the picture, and Match the meter brings the exposure back', async ({ page }) => {
    await page.goto('lab/');
    const stage = page.getByTestId('lab-stage');
    await expect(page.locator('.lab-meter')).toHaveAttribute('aria-label', /EV \d/, { timeout: 60_000 });
    for (let i = 0; i < 3; i++) await page.getByTestId('lab-aperture-less').click();
    await expect(page.getByTestId('lab-aperture-value')).toHaveText('T4');
    await expect(page.locator('.lab-meter')).toHaveAttribute('aria-label', /stops darker than the meter/);
    await expect(stage).toHaveAttribute('data-done', 'true', { timeout: 60_000 });
    await page.getByTestId('lab-match').click();
    // Cinema keeps the shutter angle and changes the stop.
    await expect(page.getByTestId('lab-shutter-value')).toHaveText('180°');
    await expect(page.locator('.lab-meter')).toHaveAttribute('aria-label', /Same as the meter|0\.[01] stops/);
  });

  test('manual focus moves the sharp area, and focusing on the subject brings it back', async ({ page }) => {
    await page.goto('lab/');
    const plan = page.locator('svg.lab-plan');
    const before = await plan.getAttribute('aria-label');
    await page.getByTestId('lab-focus-less').click();
    await expect(page.getByTestId('lab-focus-value')).toHaveText('4.0 m');
    await expect(plan).not.toHaveAttribute('aria-label', before!);
    await page.getByTestId('lab-focus-subject').click();
    await expect(page.getByTestId('lab-focus-value')).toHaveText('4.5 m');
    await expect(plan).toHaveAttribute('aria-label', before!);
    await expect(page.getByTestId('lab-focus-subject')).toHaveCount(0);
  });

  test('dock tools open in place of the plan; Esc closes and returns focus', async ({ page }) => {
    await page.goto('lab/');
    await openDock(page);
    await page.getByTestId('lab-tool-lights').click();
    await expect(page.getByTestId('lab-pane-lights')).toBeVisible();
    await expect(page.locator('svg.lab-plan')).toHaveCount(0);
    await expect(page.getByTestId('lab-tool-lights')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lab-pane-lights')).toHaveCount(0);
    await expect(page.locator('svg.lab-plan')).toBeVisible();
    await expect(page.getByTestId('lab-tool-lights')).toBeFocused();
  });

  test('Set changes the lighting scenario; Lights switches a light off', async ({ page }) => {
    await page.goto('lab/');
    await openDock(page);
    await page.getByTestId('lab-tool-set').click();
    await page.getByTestId('lab-lighting-tungsten-hard').click();
    await expect(page.getByTestId('lab-stage')).toHaveAttribute('aria-label', /Single tungsten light/);
    await page.getByTestId('lab-lighting-three-point').click();
    await page.getByTestId('lab-tool-lights').click();
    await page.getByTestId('lab-light-fill').getByRole('checkbox').uncheck();
    await page.getByTestId('lab-tool-lights').click();
    await expect(page.getByTestId('plan-light-fill')).toHaveAttribute('aria-label', /switched off/);
    await expect(page.locator('svg.lab-plan')).toHaveAttribute('aria-label', /Key, Back\./);
  });

  test('lights and the camera move on the plan with the keyboard and by dragging', async ({ page }) => {
    await page.goto('lab/');
    const key = page.getByTestId('plan-light-key');
    await expect(key).toHaveAttribute('aria-label', /Key light: 2\.2 m right, 2\.2 m in front/);
    await key.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await expect(key).toHaveAttribute('aria-label', /Key light: 1\.7 m right/);
    await page.keyboard.press('Shift+ArrowUp');
    await expect(key).toHaveAttribute('aria-label', /1\.7 m in front/);
    const cam = page.getByTestId('plan-camera');
    const box = (await cam.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    await expect(cam).not.toHaveAttribute('aria-label', /Camera · 35 mm: 0\.0 m right, 4\.5 m in front/);
    await openDock(page);
    await page.getByTestId('lab-tool-camera').click();
    await page.getByRole('button', { name: 'Back to the start' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('plan-camera')).toHaveAttribute('aria-label', /Camera · 35 mm: 0\.0 m right, 4\.5 m in front/);
  });

  test('the Camera tool changes the shared setup (Stills wording, saved for the viewfinder)', async ({ page }) => {
    await page.goto('lab/');
    await openDock(page);
    await page.getByTestId('lab-tool-camera').click();
    await page.getByRole('button', { name: 'Stills', exact: true }).click();
    await expect(page.getByTestId('lab-aperture-value')).toHaveText('f/2.8');
    await expect(page.getByTestId('lab-shutter-value')).toHaveText('1/50');
    await page.getByTestId('lab-camera-select').selectOption('nikon/z6iii');
    await expect(page.locator('.lab-tag')).toContainText('Nikon Z6III');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('capxer.save') ?? 'null')?.current);
    expect(saved).toMatchObject({ mode: 'stills', sensorId: 'nikon/z6iii' });
  });

  test('Aids show a histogram and false colour on the render', async ({ page }) => {
    await page.goto('lab/');
    await expect(page.getByTestId('lab-stage')).toHaveAttribute('data-done', 'true', { timeout: 60_000 });
    await openDock(page);
    await page.getByTestId('lab-tool-aids').click();
    await page.getByTestId('lab-hist-switch').check();
    await expect(page.getByTestId('lab-hist')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('lab-aid-false').click();
    await expect(page.getByTestId('lab-bands')).toContainText('Middle grey (18% card)');
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`every tool pane passes WCAG 2.2 AA (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('lab/');
      await openDock(page);
      for (const tool of ['set', 'lights', 'camera', 'aids']) {
        await page.getByTestId(`lab-tool-${tool}`).click();
        await expect(page.getByTestId(`lab-pane-${tool}`)).toBeVisible();
        if (tool === 'aids') {
          await page.getByTestId('lab-hist-switch').check();
          await page.getByTestId('lab-aid-false').click();
        }
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.map((v) => `${tool} ${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      }
    });
  }

  test('uses the camera and frame from the viewfinder', async ({ page }) => {
    await page.goto('lab/');
    await expect(page.locator('.lab-tag')).toContainText('ALEXA 35 · 2.39:1 · 35 mm');
    const box = await page.getByTestId('lab-stage').boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(2.39, 1);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones and tablets only');

  test('asks for a computer and draws nothing', async ({ page }) => {
    await page.goto('lab/');
    const card = page.getByTestId('lab-phone');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'The lab needs a computer' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Open the viewfinder' })).toHaveAttribute('href', /\/viewfinder\/$/);
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});

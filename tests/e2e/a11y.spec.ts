import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';
import { builtRoutes } from './routes.ts';

// WCAG 2.2 checks that axe (site.spec.ts) cannot make: focus hidden under the
// sticky bar, reflow at 320 CSS px, text spacing overrides, reduced motion.
const PAGES = builtRoutes();

/** Tab through the page; report every focused element the sticky bar or a fixed layer hides completely (2.4.11). */
async function hiddenFocus(page: Page, maxTabs = 80): Promise<string[]> {
  const hidden: string[] = [];
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    // WebKit scrolls a newly focused element into view a frame later.
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return null;
      // Sample five points; the element counts as visible if any lands on it.
      const pts = [
        [b.left + b.width / 2, b.top + b.height / 2],
        [b.left + 2, b.top + 2],
        [b.right - 2, b.top + 2],
        [b.left + 2, b.bottom - 2],
        [b.right - 2, b.bottom - 2],
      ];
      const seen = pts.some(([x, y]) => {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      });
      const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`;
      return { seen, name, key: `${name}@${Math.round(b.top)}` };
    });
    if (r && !r.seen) hidden.push(r.name);
  }
  return [...new Set(hidden)];
}

test.describe('focus is never hidden (2.4.11)', () => {
  // 80 tab presses per page, slow in WebKit while other tests run.
  test.describe.configure({ timeout: 120_000 });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      // Close the consent banner the way a keyboard user would, so it does not sit over the page.
      await page.getByRole('button', { name: 'Decline' }).click();
      expect(await hiddenFocus(page)).toEqual([]);
    });
  }
});

test.describe('reflow at 320 CSS px (1.4.10)', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('text spacing override (1.4.12)', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.addStyleTag({
        content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
                  p { margin-bottom: 2em !important; }`,
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Text cut off inside a fixed-size box: a clipping element whose content is taller or wider than itself.
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main *, header *')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], .sr-only')) return false;
            const clips = /(hidden|clip)/.test(cs.overflowX + cs.overflowY) && !/(auto|scroll)/.test(cs.overflowX + cs.overflowY);
            const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
            return clips && hasText && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2);
          })
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent!.trim().slice(0, 30)}"`),
      );
      expect(clipped).toEqual([]);
    });
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      const moving = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            const dur = (s: string) => Math.max(...s.split(',').map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 1 : 1000)));
            const animated = cs.animationName !== 'none' && dur(cs.animationDuration) > 10 && cs.animationIterationCount !== '0';
            // Transitions of movement only (colour fades are fine).
            const moves = /transform|translate|left|top|width|height|grid|all/.test(cs.transitionProperty) && dur(cs.transitionDuration) > 10;
            return animated || moves;
          })
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')}`),
      );
      expect([...new Set(moving)]).toEqual([]);
    });
  }
});

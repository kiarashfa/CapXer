import { test, expect } from './fixtures.ts';
import { builtRoutes } from './routes.ts';

// Layout guard for every page. The site has two views (mobile/tablet and desktop,
// see global.css). In both, content must sit centred and fill its container, so
// text never stops short and leaves an empty band on the right.
// The widths below are samples of those views, not breakpoints.
const SAMPLES = [
  { name: 'tablet', width: 1000 },
  { name: 'desktop', width: 1440 },
  { name: 'wide desktop', width: 2560 },
];
const MAX_OFF_CENTRE = 0.05; // of the window width
const MIN_FILL = 0.9; // of the container's content width

test.describe('layout', () => {
  test.skip(({ isMobile }) => isMobile, 'phones are covered by the mobile projects');

  for (const route of builtRoutes()) {
    test(`${route} is centred and fills its container`, async ({ page }) => {
      for (const s of SAMPLES) {
        await page.setViewportSize({ width: s.width, height: 1000 });
        await page.goto(route);
        const m = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const main = document.querySelector('main')!;
          let left = Infinity;
          let right = -Infinity;
          for (const el of main.querySelectorAll('h1, h2, h3, h4, p, li, figure, img, svg, table, pre, blockquote, form, canvas, video')) {
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue; // sr-only and empty elements
            left = Math.min(left, r.left);
            right = Math.max(right, r.right);
          }
          const cs = getComputedStyle(main);
          const available = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { leftGap: left, rightGap: vw - right, fill: (right - left) / available, vw };
        });

        expect(m.fill, `${route} (${s.name}, ${s.width}px): content fills only ${Math.round(m.fill * 100)}% of its container`).toBeGreaterThanOrEqual(
          MIN_FILL,
        );
        expect(
          Math.abs(m.leftGap - m.rightGap),
          `${route} (${s.name}, ${s.width}px): off-centre (left ${Math.round(m.leftGap)}px, right ${Math.round(m.rightGap)}px)`,
        ).toBeLessThanOrEqual(m.vw * MAX_OFF_CENTRE);
      }
    });
  }
});

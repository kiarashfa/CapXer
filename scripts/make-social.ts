// Makes public/social-card.png (1200 x 630), the preview image link previews
// show (og:image). Drawn in the light theme of the design system: the mark and
// name, the tagline, and the hero drawing (2.39:1 frame lines in a 16:9 scene).
// Run by hand when the look or tagline changes: `node scripts/make-social.ts`.
// The PNG is committed, so the build needs nothing extra. Rendered by
// Playwright's Chromium with the site's own self-hosted fonts.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { en as t } from '../src/i18n/en.ts';

const require = createRequire(import.meta.url);
// Inlined as data: URIs (a page set from a string cannot load file:// fonts).
const font = (pkg: string, file: string) =>
  `data:font/woff2;base64,${readFileSync(require.resolve(`${pkg}/files/${file}`)).toString('base64')}`;
const FIGTREE = font('@fontsource-variable/figtree', 'figtree-latin-wght-normal.woff2');
const MONO = font('@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2');

// Same geometry as src/components/layout/FramePreview.astro.
const MASK = 12.81;
const FRAME = 100 - 2 * MASK;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Figtree; src: url(${FIGTREE}) format('woff2'); font-weight: 300 900; }
@font-face { font-family: Mono; src: url(${MONO}) format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #f4f6f8; color: #14243a; font-family: Figtree; display: grid;
  grid-template-columns: 500px 1fr; gap: 56px; align-items: center; padding: 0 72px; overflow: hidden;
  background-image: linear-gradient(#ebeff3 1px, transparent 1px), linear-gradient(90deg, #ebeff3 1px, transparent 1px);
  background-size: 24px 24px; }
.brand { display: flex; align-items: center; gap: 16px; font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
.brand svg { width: 56px; height: 56px; color: #3451d1; }
h1 { margin-top: 40px; font-size: 58px; line-height: 1.06; font-weight: 800; letter-spacing: -0.025em; }
p { margin-top: 24px; font-size: 26px; line-height: 1.4; color: #4d5d70; }
.frame { position: relative; aspect-ratio: 16 / 9; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 0 0 1.5px #14243a; }
.frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.hatch { position: absolute; left: 0; right: 0; height: ${MASK}%;
  background: repeating-linear-gradient(135deg, rgba(20,36,58,.12) 0 1.5px, transparent 1.5px 9px), rgba(20,36,58,.05); }
.line { position: absolute; border-color: #3451d1; opacity: .55; }
.tag { position: absolute; top: 3%; left: 16px; background: #fff; border-radius: 999px; padding: 2px 12px; font: 500 18px Mono; }
.dim { position: relative; margin-top: 12px; height: 30px; border-left: 1.5px solid #14243a; border-right: 1.5px solid #14243a; }
.dim::before { content: ''; position: absolute; left: 0; right: 0; top: 14px; border-top: 1.5px solid #14243a; }
.dim span { position: absolute; left: 50%; top: 0; transform: translateX(-50%); background: #f4f6f8; padding: 0 12px; font: 500 18px Mono; color: #4d5d70; }
</style></head><body>
<div>
  <div class="brand"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7"/><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>${t.site.name}</div>
  <h1>${t.site.tagline}</h1>
  <p>${t.site.cardLine}</p>
</div>
<div>
  <div class="frame">
    <svg viewBox="0 0 358 201" preserveAspectRatio="none" fill="none" stroke="#14243a" stroke-width="1.6">
      <circle cx="268" cy="72" r="14"/>
      <path d="M0 138 Q64 101 128 128 T248 117 T358 110"/>
      <path d="M0 162 Q82 138 174 156 T358 147"/>
      <path d="M233 158 v-31 a5.5 5.5 0 0 1 11 0 v31Z M238.5 117 a5.5 5.5 0 1 1 0.01 0Z"/>
    </svg>
    <div class="hatch" style="top:0"></div><div class="hatch" style="bottom:0"></div>
    <div style="position:absolute;left:0;right:0;top:${MASK}%;bottom:${MASK}%;box-shadow:inset 0 0 0 3px #3451d1"></div>
    <div class="line" style="left:33.333%;top:${MASK}%;bottom:${MASK}%;border-left:1.5px solid"></div>
    <div class="line" style="left:66.667%;top:${MASK}%;bottom:${MASK}%;border-left:1.5px solid"></div>
    <div class="line" style="left:0;right:0;top:${MASK + FRAME / 3}%;border-top:1.5px solid"></div>
    <div class="line" style="left:0;right:0;top:${MASK + (2 * FRAME) / 3}%;border-top:1.5px solid"></div>
    <span class="tag">2.39 : 1</span>
  </div>
  <div class="dim"><span>16 : 9 recorded area</span></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../public/social-card.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
await browser.close();
console.log('make-social: public/social-card.png written');

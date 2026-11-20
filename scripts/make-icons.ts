// Makes the installed-app icons in public/icons/ from the CapXer mark (the
// favicon: corner marks and a centre dot on the dark tile). Run by hand when the
// mark changes: `node scripts/make-icons.ts`. The PNGs are committed, so the
// build needs nothing extra. Uses sharp, which Astro already installs.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = new URL('../public/icons/', import.meta.url);
const TILE = '#10151d';
const MARK = '#9db0ff';

/** The mark on a 32-unit grid, scaled about the centre. */
const mark = (scale: number) =>
  `<g transform="translate(16 16) scale(${scale}) translate(-16 -16)"><g fill="none" stroke="${MARK}" stroke-width="2.5" stroke-linecap="round"><path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5"/></g><circle cx="16" cy="16" r="2.5" fill="${MARK}"/></g>`;

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

const icons: [string, number, string][] = [
  // "any": the rounded tile, as in the favicon.
  ['icon-192.png', 192, svg(`<rect width="32" height="32" rx="8" fill="${TILE}"/>${mark(1)}`)],
  ['icon-512.png', 512, svg(`<rect width="32" height="32" rx="8" fill="${TILE}"/>${mark(1)}`)],
  // "maskable": full bleed; the mark stays well inside the 80% safe circle Android may crop to.
  ['icon-maskable-512.png', 512, svg(`<rect width="32" height="32" fill="${TILE}"/>${mark(0.72)}`)],
  // iOS rounds the corners itself.
  ['apple-touch-icon.png', 180, svg(`<rect width="32" height="32" fill="${TILE}"/>${mark(0.86)}`)],
];

mkdirSync(OUT, { recursive: true });
for (const [name, size, source] of icons) {
  const png = await sharp(Buffer.from(source), { density: (72 * size) / 32 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(new URL(name, OUT), png);
  console.log(`${name} ${size}x${size} ${png.length} bytes`);
}

import type { BrandConfig } from './brand.ts';

/**
 * Social card of CapXer: the one image used for link previews and for the GitHub social preview.
 * Edit the values below and run `npm run brand`; the layout itself is in brand.ts.
 * Paths are relative to the folder that holds `public/`.
 */
export default {
  name: 'CapXer',
  // The wordmark as HTML. The families are the ones listed in `fonts`; an accent letter is a coloured span.
  wordmark: `<span style="font-family:Figtree;font-weight:700;letter-spacing:-.02em">Cap<span style="color:#8fb4ff">X</span>er</span>`,
  wordmarkSize: 150,
  // One short creative line, specific to this project.
  line: 'See the frame before you shoot.',
  background: '#10151d',
  // Accent: rules, diamonds, first glow and most lights. Secondary: second glow and some lights.
  primary: '#8fb4ff',
  secondary: '#5fc9c0',
  // The icon tile shown on the card.
  icon: 'public/icons/icon-512.png',
  bodyFont: 'Figtree',
  fonts: [
    { family: 'Figtree', file: 'scripts/brand/fonts/figtree-variable.woff2', weight: '100 900' },
  ],
  output: 'public/og-image.jpg',
} satisfies BrandConfig;

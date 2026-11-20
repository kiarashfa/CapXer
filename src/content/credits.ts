// Third-party software and fonts CapXer uses. One list for the About page and
// for tests/unit/credits.test.ts, which checks that every package in
// package.json is covered here and that every entry is in THIRD_PARTY.md.

export interface Credit {
  name: string;
  /** Short use, shown on the About page. */
  use: string;
  licence: string;
  href: string;
  /** npm packages this entry covers. */
  packages: string[];
  /** Shown on the About page (shipped to visitors, or a main build tool). */
  about: boolean;
}

export const CREDITS: Credit[] = [
  { name: 'Astro', use: 'Site framework (build time)', licence: 'MIT', href: 'https://astro.build', packages: ['astro', '@astrojs/svelte', '@astrojs/mdx', '@astrojs/check', '@astrojs/markdown-satteri'], about: true },
  { name: 'Svelte', use: 'Interactive components', licence: 'MIT', href: 'https://svelte.dev', packages: ['svelte'], about: true },
  { name: 'Workbox', use: 'Offline support', licence: 'MIT', href: 'https://github.com/GoogleChrome/workbox', packages: ['workbox-build'], about: true },
  { name: 'Tailwind CSS', use: 'Styling (build time)', licence: 'MIT', href: 'https://tailwindcss.com', packages: ['tailwindcss', '@tailwindcss/vite'], about: true },
  { name: 'Figtree', use: 'Typeface', licence: 'SIL Open Font', href: 'https://github.com/erikdkennedy/figtree', packages: ['@fontsource-variable/figtree'], about: true },
  { name: 'JetBrains Mono', use: 'Typeface for numbers', licence: 'SIL Open Font', href: 'https://github.com/JetBrains/JetBrainsMono', packages: ['@fontsource-variable/jetbrains-mono'], about: true },
  { name: 'Fontsource', use: 'Font packaging', licence: 'MIT', href: 'https://github.com/fontsource/fontsource', packages: [], about: false },
  { name: 'Satteri', use: 'Markdown for lessons (build time)', licence: 'MIT', href: 'https://github.com/bruits/satteri', packages: ['satteri'], about: false },
  { name: 'TypeScript', use: 'Type checking', licence: 'Apache-2.0', href: 'https://github.com/microsoft/TypeScript', packages: ['typescript', '@types/node'], about: false },
  { name: 'Vitest', use: 'Unit tests', licence: 'MIT', href: 'https://github.com/vitest-dev/vitest', packages: ['vitest'], about: false },
  { name: 'jsdom', use: 'Unit tests', licence: 'MIT', href: 'https://github.com/jsdom/jsdom', packages: ['jsdom'], about: false },
  { name: 'Playwright', use: 'Browser tests', licence: 'Apache-2.0', href: 'https://github.com/microsoft/playwright', packages: ['@playwright/test'], about: false },
  { name: 'axe-core', use: 'Accessibility tests', licence: 'MPL-2.0', href: 'https://github.com/dequelabs/axe-core', packages: ['@axe-core/playwright'], about: false },
  { name: 'Zod', use: 'Data validation', licence: 'MIT', href: 'https://github.com/colinhacks/zod', packages: ['zod'], about: false },
  { name: 'sharp', use: 'Making the app icons', licence: 'Apache-2.0', href: 'https://github.com/lovell/sharp', packages: [], about: false },
];

// Writes dist/sw.js after `astro build`: a Workbox service worker that
// precaches the whole site, so the installed app works offline (viewfinder,
// live camera, aids, camera data, every page). The v2 lab, when it exists,
// stays out of the precache (large assets, online only).
//
// Fonts: the Latin files are precached; other scripts' subsets load on first
// use and are cached then. Google Analytics is never cached.
// Updates: skipWaiting is off. A new version waits until the user presses
// Reload on the "Update ready" note (src/lib/pwa.ts), which sends SKIP_WAITING.
import { generateSW } from 'workbox-build';
import { BASE_PATH } from '../src/config/site.ts';

const dist = new URL('../dist/', import.meta.url);
const base = BASE_PATH;

const { count, size, warnings } = await generateSW({
  globDirectory: dist.pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  globPatterns: [
    '**/*.{html,js,css,svg,png,webmanifest}',
    '_astro/*-latin-wght-normal.*.woff2',
    '_astro/*-latin-ext-wght-normal.*.woff2',
  ],
  globIgnores: ['sw.js', 'workbox-*.js', 'lab/**'],
  swDest: new URL('sw.js', dist).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  modifyURLPrefix: { '': base },
  // Hashed file names under _astro/ never change content; no extra revision needed.
  dontCacheBustURLsMatching: /^.*\/_astro\//,
  directoryIndex: 'index.html',
  navigateFallback: `${base}404.html`,
  navigateFallbackAllowlist: [new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)],
  navigateFallbackDenylist: [new RegExp(`^${base}lab/`)],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  inlineWorkboxRuntime: true,
  sourcemap: false,
  mode: 'production',
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith(`${base}_astro/`) && url.pathname.endsWith('.woff2'),
      handler: 'CacheFirst',
      options: { cacheName: 'capxer-fonts', expiration: { maxEntries: 30 } },
    },
  ],
});

for (const w of warnings) console.warn(`build-sw: ${w}`);
console.log(`build-sw: ${count} files precached, ${(size / 1024).toFixed(0)} KB`);

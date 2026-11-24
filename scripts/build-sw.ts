// Writes dist/sw.js after `astro build`: a Workbox service worker that
// precaches the whole site, so the installed app works offline (viewfinder,
// live camera, aids, camera data, every page). The v2 lab stays out of the
// precache (large, online only): its page and every script only it reaches.
//
// Fonts: the Latin files are precached; other scripts' subsets load on first
// use and are cached then. Google Analytics and the cloud-save APIs are never cached.
// Updates: skipWaiting is off. A new version waits until the user presses
// Reload on the "Update ready" note (src/lib/pwa.ts), which sends SKIP_WAITING.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSW } from 'workbox-build';
import { BASE_PATH } from '../src/config/site.ts';

const dist = new URL('../dist/', import.meta.url);
const base = BASE_PATH;
const distDir = fileURLToPath(dist);

// The lab's code (three.js, Threlte, sets, subjects) is large and online only.
// Leave out every script that only the lab page can reach, through static or
// dynamic imports; scripts shared with other pages stay in the precache.
const SCRIPT = /<script[^>]*\bsrc="([^"]+\.js)"|\b(?:component|renderer)-url="([^"]+\.js)"|<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g;
const IMPORT = /\b(?:import|from)\s*\(?\s*["'`]([^"'`]+\.js)["'`]/g;

function reachable(htmlFile: string): Set<string> {
  const seen = new Set<string>();
  const visit = (siteUrl: string) => {
    if (!siteUrl.startsWith(base) || seen.has(siteUrl)) return;
    const file = join(distDir, siteUrl.slice(base.length));
    if (!existsSync(file)) return;
    seen.add(siteUrl);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      visit(m[1]!.startsWith('/') ? m[1]! : posix.join(posix.dirname(siteUrl), m[1]!));
    }
  };
  const html = readFileSync(htmlFile, 'utf8');
  for (const m of html.matchAll(SCRIPT)) visit(m[1] ?? m[2] ?? m[3]!);
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) for (const i of m[1]!.matchAll(IMPORT)) visit(i[1]!);
  return seen;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '_astro' ? [] : htmlFiles(p);
    return name.endsWith('.html') ? [p] : [];
  });
}

const pagesHtml = htmlFiles(distDir);
const labHtml = pagesHtml.filter((p) => relative(distDir, p).split(sep)[0] === 'lab');
const shared = new Set(pagesHtml.filter((p) => !labHtml.includes(p)).flatMap((p) => [...reachable(p)]));
const labOnly = [...new Set(labHtml.flatMap((p) => [...reachable(p)]))].filter((u) => !shared.has(u)).map((u) => u.slice(base.length));

const { count, size, warnings } = await generateSW({
  globDirectory: dist.pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  globPatterns: [
    '**/*.{html,js,css,svg,png,webmanifest}',
    '_astro/*-latin-wght-normal.*.woff2',
    '_astro/*-latin-ext-wght-normal.*.woff2',
  ],
  // og-image.jpg is only for link previews; sitemap and robots are for crawlers.
  globIgnores: ['sw.js', 'workbox-*.js', 'lab/**', 'og-image.jpg', ...labOnly],
  swDest: new URL('sw.js', dist).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  modifyURLPrefix: { '': base },
  // Hashed file names under _astro/ never change content; no extra revision needed.
  dontCacheBustURLsMatching: /^.*\/_astro\//,
  directoryIndex: 'index.html',
  // Dropbox sends the user back to /user/?code=...&state=...: serve the cached page, not the 404.
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^code$/, /^state$/, /^error/],
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
console.log(`build-sw: ${labOnly.length} lab-only scripts left out of the precache`);
console.log(`build-sw: ${count} files precached, ${(size / 1024).toFixed(0)} KB`);

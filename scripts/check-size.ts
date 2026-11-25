// Size budget for the built site (run after `npm run build`).
//
// For every built page: the JavaScript it loads at start (entry scripts, island
// components and renderers, plus everything they import statically), gzipped.
// Code loaded later with import() (camera, aids, capture) is not counted: it
// only loads when the visitor turns that feature on.
// Also: the total size of the offline precache listed in dist/sw.js.
//
// Budgets are our own numbers (no standard), set at P8 with about 40 % headroom
// over the measured size (P8: viewfinder 62 KB, other pages 28 KB, precache 659 KB). Raising one is fine when a feature needs it: change
// the number here on purpose, never to silence a surprise.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { BASE_PATH } from '../src/config/site.ts';

export const BUDGET = {
  /** Start-up JS of the viewfinder page, KB gzipped. */
  viewfinderJs: 90,
  /** Start-up JS of the lab page (v2: three.js + Threlte; the L0 spike measured 209 KB). Online only, never precached. */
  labJs: 300,
  /** Start-up JS of the profile page (v1.1: it validates save files, which needs the camera data; measured 52 KB). */
  userJs: 70,
  /** Start-up JS of any other page, KB gzipped (v1.1 adds the profile circle: measured 34 KB). */
  pageJs: 40,
  /** Everything the service worker precaches, KB uncompressed. */
  precache: 900,
};

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/** Site URL (/CapXer/_astro/x.js) or relative import -> file under dist/. */
function toFile(ref: string, fromUrl: string): string | null {
  if (/^(https?:)?\/\//.test(ref)) return null;
  const u = ref.startsWith('/') ? ref : posix.join(posix.dirname(fromUrl), ref);
  if (!u.startsWith(BASE_PATH)) return null;
  return join(DIST, u.slice(BASE_PATH.length).split('?')[0]);
}

const IMPORT = /(?:\bimport|\bexport)\s*(?:[\w*{}\s,$]*?\bfrom\s*)?["']([^"']+\.js)["']/g;

function jsClosure(entries: string[]): Map<string, number> {
  const seen = new Map<string, number>();
  const visit = (url: string) => {
    const file = toFile(url, BASE_PATH);
    if (!file || seen.has(url) || !existsSync(file)) return;
    const code = readFileSync(file);
    seen.set(url, gzipSync(code, { level: 9 }).length);
    for (const m of code.toString('utf8').matchAll(IMPORT)) {
      const next = m[1].startsWith('/') ? m[1] : posix.join(posix.dirname(url), m[1]);
      visit(next);
    }
  };
  entries.forEach(visit);
  return seen;
}

function pageEntries(html: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /<script[^>]*\bsrc="([^"]+\.js)"/g,
    /\bcomponent-url="([^"]+)"/g,
    /\brenderer-url="([^"]+)"/g,
    /<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g,
  ];
  for (const p of patterns) for (const m of html.matchAll(p)) out.add(m[1]);
  // Bundled module scripts written inline still import chunks.
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    for (const i of m[1].matchAll(IMPORT)) out.add(i[1]);
  }
  return [...out];
}

function pages(): string[] {
  const list: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '_astro') walk(p);
      } else if (name.endsWith('.html')) list.push(p);
    }
  };
  walk(DIST);
  return list.sort();
}

export function measure() {
  const rows = pages().map((file) => {
    const rel = relative(DIST, file).split(sep).join('/');
    const js = jsClosure(pageEntries(readFileSync(file, 'utf8')));
    const kb = [...js.values()].reduce((a, b) => a + b, 0) / 1024;
    const limit = rel.startsWith('viewfinder/')
      ? BUDGET.viewfinderJs
      : rel.startsWith('lab/')
        ? BUDGET.labJs
        : rel.startsWith('user/')
          ? BUDGET.userJs
          : BUDGET.pageJs;
    return { page: rel, kb, limit, files: js.size };
  });
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const urls = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]))];
  const precacheKb =
    urls.reduce((sum, u) => {
      const f = toFile(u, BASE_PATH);
      const p = f && statSync(f, { throwIfNoEntry: false });
      return sum + (p && p.isFile() ? p.size : 0);
    }, 0) / 1024;
  return { rows, precacheKb, precacheFiles: urls.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('check-size: dist/sw.js not found. Run `npm run build` first.');
    process.exit(1);
  }
  const { rows, precacheKb, precacheFiles } = measure();
  let failed = false;
  for (const r of rows) {
    const over = r.kb > r.limit;
    failed ||= over;
    console.log(
      `${over ? 'OVER' : 'ok  '} ${r.page.padEnd(32)} ${r.kb.toFixed(1).padStart(6)} KB gz JS (${r.files} files, budget ${r.limit})`,
    );
  }
  const over = precacheKb > BUDGET.precache;
  failed ||= over;
  console.log(
    `${over ? 'OVER' : 'ok  '} ${'precache'.padEnd(32)} ${precacheKb.toFixed(0).padStart(6)} KB (${precacheFiles} files, budget ${BUDGET.precache})`,
  );
  if (failed) {
    console.error(
      'check-size: over budget. Shrink the change, or raise the budget in scripts/check-size.ts on purpose.',
    );
    process.exit(1);
  }
}

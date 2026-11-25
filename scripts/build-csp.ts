// Adds a Content Security Policy <meta> tag to every built page (run after
// `astro build`, before scripts/build-sw.ts so the precache sees the final HTML).
// GitHub Pages cannot send headers, so the policy has to live in the page.
//
// Why our own step and not Astro's `security.csp`: Astro does not hash
// `is:inline` scripts (theme, old-browser check, consent button) and puts its tag
// after them; a policy only covers what comes after it in the document.
// Here the tag goes first in <head> and every inline script gets a sha256 hash,
// so script-src never needs 'unsafe-inline'.
// Styles keep 'unsafe-inline': Svelte and our markup use style="" attributes,
// which hashes cannot allow. Google Analytics hosts are needed only after "Allow
// analytics"; Google sign-in, Drive and Dropbox only after the user connects a
// cloud save (src/user/cloud.ts).
// tests/e2e/console.spec.ts fails on any CSP violation in the browser.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GA = [
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://*.googletagmanager.com',
];
const CLOUD = [
  'https://accounts.google.com',
  'https://www.googleapis.com',
  'https://api.dropboxapi.com',
  'https://content.dropboxapi.com',
];

export const DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'form-action': ["'self'"],
  // Vite inlines very small font files as data: URIs.
  'font-src': ["'self'", 'data:'],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'media-src': ["'self'", 'blob:', 'mediastream:'],
  'img-src': ["'self'", 'data:', 'blob:', ...GA],
  'connect-src': ["'self'", ...GA, ...CLOUD],
  'frame-src': ['https://accounts.google.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
  'script-src': [
    "'self'",
    'https://www.googletagmanager.com',
    'https://accounts.google.com/gsi/client',
  ],
};

export function policyFor(html: string): string {
  const hashes = new Set<string>();
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1] ?? '';
    if (/\ssrc=/.test(attrs) || /type="(application\/(ld\+)?json|text\/plain)"/.test(attrs))
      continue;
    hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  return Object.entries(DIRECTIVES)
    .map(([k, v]) => [k, ...v, ...(k === 'script-src' ? [...hashes].sort() : [])].join(' '))
    .join('; ');
}

export function withPolicy(html: string): string {
  if (html.includes('http-equiv="content-security-policy"'))
    throw new Error('page already has a CSP tag');
  const tag = `<meta http-equiv="content-security-policy" content="${policyFor(html)}">`;
  // Right after <meta charset>, which must stay in the first bytes of the document.
  const out = html.replace(/(<head>\s*<meta charset="utf-8">)/i, `$1${tag}`);
  if (out === html) throw new Error('no <head><meta charset> found');
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  let n = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '_astro') walk(p);
      } else if (name.endsWith('.html')) {
        writeFileSync(p, withPolicy(readFileSync(p, 'utf8')));
        n++;
      }
    }
  };
  walk(dist);
  console.log(`build-csp: policy added to ${n} pages`);
}

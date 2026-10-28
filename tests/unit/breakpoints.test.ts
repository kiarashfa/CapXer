import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The site has exactly two views: base (mobile/tablet) and `desktop:`.
// Tailwind's default breakpoints are removed in global.css, so a stray sm:/md:/lg:
// class would silently do nothing. Fail loudly instead.
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const STRAY = /(?<![\w-])(sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl):[a-z[]/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : ['.astro', '.svelte', '.ts', '.mdx'].includes(extname(n)) ? [p] : [];
  });
}

describe('breakpoints', () => {
  it('uses only the desktop: variant', () => {
    const hits = files(SRC).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(STRAY)].map((m) => `${relative(SRC, f)}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});

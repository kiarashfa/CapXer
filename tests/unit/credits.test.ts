import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS } from '../../src/content/credits.ts';
import { VERSION } from '../../src/config/site.ts';

const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const thirdParty = readFileSync(new URL('THIRD_PARTY.md', root), 'utf8');

describe('credits', () => {
  it('every package in package.json is credited', () => {
    const covered = new Set(CREDITS.flatMap((c) => c.packages));
    const all = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(all.filter((p) => !covered.has(p))).toEqual([]);
  });

  it('every credit is listed in THIRD_PARTY.md', () => {
    // First cell of every table row, with a Markdown link reduced to its text.
    const rows = thirdParty
      .split('\n')
      .filter((l) => l.startsWith('| '))
      .map((l) => l.split('|')[1]!.trim().replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1'));
    // Shipped items (shown on the About page) have a row; build-only tools are named in the text.
    const missing = CREDITS.filter((c) => (c.about ? !rows.includes(c.name) : !rows.includes(c.name) && !thirdParty.includes(c.name)));
    expect(missing.map((c) => c.name)).toEqual([]);
  });

  it('runtime packages and fonts are shown on the About page', () => {
    const runtime = Object.keys(pkg.dependencies ?? {}).concat('svelte', 'workbox-build');
    const shown = new Set(CREDITS.filter((c) => c.about).flatMap((c) => c.packages));
    expect(runtime.filter((p) => !shown.has(p))).toEqual([]);
  });

  it('the shown version matches package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});

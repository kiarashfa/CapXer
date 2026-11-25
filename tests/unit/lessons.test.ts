import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANATOMY } from '../../src/content/anatomy.ts';
import { firstDrawing } from '../../src/content/drawings.ts';

// Every lesson follows the same anatomy (src/content/anatomy.ts), so the series stays consistent.
const DIR = fileURLToPath(new URL('../../src/content/lessons/', import.meta.url));
const lessons = existsSync(DIR)
  ? readdirSync(DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ slug: d.name, src: readFileSync(`${DIR}${d.name}/index.mdx`, 'utf8') }))
  : [];

const body = (src: string) => src.replace(/^---[\s\S]*?---/, '');
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;
const words = (src: string) =>
  body(src)
    .replace(/\[@[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`|]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

describe('lesson anatomy', () => {
  it('there is at least one lesson', () => expect(lessons.length).toBeGreaterThan(0));

  for (const { slug, src } of lessons) {
    describe(slug, () => {
      const b = body(src);
      const sections = b.split(/^## /m).slice(1);

      it('has a word count in range', () => {
        const n = words(src);
        expect(n, `${n} words`).toBeGreaterThanOrEqual(ANATOMY.words.min);
        expect(n, `${n} words`).toBeLessThanOrEqual(ANATOMY.words.max);
      });

      it('has the right number of short sections and no H1', () => {
        expect(count(b, /^# /gm)).toBe(0);
        expect(sections.length).toBeGreaterThanOrEqual(ANATOMY.sections.min);
        expect(sections.length).toBeLessThanOrEqual(ANATOMY.sections.max);
        for (const s of sections) {
          const title = s.split('\n')[0].trim();
          expect(title.split(/\s+/).length, title).toBeLessThanOrEqual(ANATOMY.headingMaxWords);
        }
      });

      it('has a first drawing the Lessons page card can show', () => {
        const d = firstDrawing(b);
        expect(d, 'a figure drawing such as <RatioFrames ... />').not.toBeNull();
        expect(Object.keys(d!.props).length).toBeGreaterThan(0);
      });

      it('has figures, Try blocks with buttons, and one Our view as the last section', () => {
        const figures = count(b, /<Figure\b/g);
        expect(figures).toBeGreaterThanOrEqual(ANATOMY.figures.min);
        expect(figures).toBeLessThanOrEqual(ANATOMY.figures.max);
        const tries = [...b.matchAll(/<Try>([\s\S]*?)<\/Try>/g)];
        expect(tries.length).toBeGreaterThanOrEqual(ANATOMY.tries.min);
        expect(tries.length).toBeLessThanOrEqual(ANATOMY.tries.max);
        for (const t of tries) expect(t[1]).toMatch(/<TryLink\b/);
        expect(count(b, /<OurView>/g)).toBe(ANATOMY.ourView);
        const last = sections.at(-1)!.split('\n').slice(1).join('\n').trim();
        expect(
          last.startsWith('<OurView>') && last.endsWith('</OurView>'),
          'last section holds only <OurView>',
        ).toBe(true);
      });
    });
  }
});

import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { markdownToHtml, mdxToJs } from 'satteri';
import { citations, formatReference, parseMarker, type CitationData } from '../../src/content/cite/index.ts';
import { references } from '../../src/references/index.ts';
import { ReferenceSchema } from '../../src/references/schema.ts';

const KEYS = ['smpte-st-59-1998', 'ebu-r95-2017', 'itu-r-bt709-6'];
const LESSON = pathToFileURL(`${process.cwd()}/src/content/lessons/test/index.mdx`);

// Same engine and entry point Astro uses for .mdx; returns the compiled code and the plugin's data.
function compile(src: string, opts: Partial<Parameters<typeof citations>[0]> = {}, fileURL: URL = LESSON) {
  const { code, data } = mdxToJs(src, {
    mdastPlugins: [citations({ references: KEYS, ...opts })],
    fileURL,
    data: { astro: { frontmatter: {}, headings: [], localImagePaths: new Set(), remoteImagePaths: new Set() } },
  }) as { code: string; data: { citations?: CitationData; astro: { frontmatter: Record<string, unknown> } } };
  // Citation labels use non-breaking spaces (escaped in compiled code); compare with plain spaces.
  return { code: code.replace(/\\xA0|\u00a0/g, ' '), data };
}
const fails = (src: string, opts = {}) => () => compile(src, opts);
// The same plugin through the Markdown entry point, to assert on the HTML a reader gets.
const html = (src: string) => markdownToHtml(src, { mdastPlugins: [citations({ references: KEYS })], fileURL: LESSON }).html;

describe('citation markers', () => {
  it('parses one or several citations with locators', () => {
    expect(parseMarker('@a, p. 12')).toEqual({ ok: true, items: [{ key: 'a', label: 'p.', value: '12', locator: 'p. 12' }] });
    const r = parseMarker('@a, sec. 2.1; @b-2, table 1');
    expect(r.ok && r.items.map((i) => i.locator)).toEqual(['sec. 2.1', 'table 1']);
    expect(parseMarker('@v, at 12:34').ok).toBe(true);
  });

  it('requires a locator from the fixed list and suggests the right label', () => {
    expect(parseMarker('@a')).toMatchObject({ ok: false, error: expect.stringContaining('no locator') });
    expect(parseMarker('@a, 12')).toMatchObject({ ok: false, error: expect.stringContaining('needs a label') });
    expect(parseMarker('@a, pg 12')).toMatchObject({ ok: false, error: expect.stringContaining('use "p."') });
    expect(parseMarker('@A_b, p. 1')).toMatchObject({ ok: false, error: expect.stringContaining('not a valid reference key') });
  });
});

describe('citation plugin', () => {
  it('numbers sources by first appearance and reuses a number', () => {
    const src = 'First [@ebu-r95-2017, sec. 2].\n\nSecond [@smpte-st-59-1998, table 1; @ebu-r95-2017, sec. 3].\n';
    const { code, data } = compile(src);
    expect(data.citations?.sources).toEqual(['ebu-r95-2017', 'smpte-st-59-1998']);
    expect(data.astro.frontmatter.sources).toEqual(['ebu-r95-2017', 'smpte-st-59-1998']);
    expect(data.astro.frontmatter.citedAt).toEqual([['sec. 2', 'sec. 3'], ['table 1']]);
    expect(code).not.toContain('[@');
    const out = html(src);
    // Raised source numbers right after the word; several sources joined in one group.
    expect(out).toContain(
      'First<sup class="cites"><a href="#source-1" class="cite" data-source="1" data-locator="sec. 2" aria-label="Source 1, sec. 2">1</a></sup>.',
    );
    expect(out).toContain(
      'Second<sup class="cites"><a href="#source-2" class="cite" data-source="2" data-locator="table 1" aria-label="Source 2, table 1">2</a>,<a href="#source-1"',
    );
  });

  it('merges places of one source and joins markers in a row', () => {
    const out = html('A [@ebu-r95-2017, p. 3; @ebu-r95-2017, p. 4] and B [@ebu-r95-2017, p. 9] [@smpte-st-59-1998, table 1].\n');
    expect(out).toContain('data-locator="p. 3, p. 4"');
    expect(out.match(/class="cite"/g)).toHaveLength(3);
    expect(out).toContain('>1</a>,<a href="#source-2"');
    expect(out).not.toContain('</sup><sup');
  });

  it('sorts the places of a source naturally', () => {
    const { data } = compile('A [@ebu-r95-2017, p. 36]. B [@ebu-r95-2017, p. 7]. C [@ebu-r95-2017, p. 189].\n');
    expect(data.citations?.citedAt).toEqual([['p. 7', 'p. 36', 'p. 189']]);
  });

  it('fails on an unknown key, with file and line', () => {
    expect(fails('Fine [@ebu-r95-2017, sec. 2].\n\nBad [@smpte-59, p. 1].\n')).toThrow(
      /src\/content\/lessons\/test\/index\.mdx:3:\d+ {2}\[@smpte-59\] is not in/,
    );
  });

  it('fails on a missing or unknown locator', () => {
    expect(fails('Text [@ebu-r95-2017].\n')).toThrow(/no locator/);
    expect(fails('Text [@ebu-r95-2017, page 3].\n')).toThrow(/unknown locator "page"; use "p\."/);
  });

  it('fails on a marker that never closes', () => {
    expect(fails('Text [@ebu-r95-2017, sec. 2 and on.\n')).toThrow(/not closed/);
  });

  it('fails on an uncited paragraph, list item, blockquote, figure caption or table', () => {
    expect(fails('A fact with no source.\n')).toThrow(/no citation: "A fact with no source\."/);
    expect(fails('- cited [@ebu-r95-2017, sec. 2]\n- not cited\n')).toThrow(/no citation: "not cited"/);
    expect(fails('> A quote.\n')).toThrow(/no citation/);
    expect(fails('<Figure>\n\nCaption with no source.\n\n</Figure>\n')).toThrow(/no citation/);
    expect(fails('| Ratio | Use |\n| --- | --- |\n| 1.85 | Film |\n')).toThrow(/table has no citation/);
  });

  it('lists every problem at once', () => {
    expect(fails('One.\n\nTwo.\n\nThree [@nope, p. 1].\n')).toThrow(/3 problem\(s\)/);
  });

  it('accepts cited tables, headings and Try / OurView blocks without citations', () => {
    const src = [
      '## A heading needs no source',
      '| Ratio | Use |\n| --- | --- |\n| 1.85 | Film [@smpte-st-59-1998, table 1] |',
      '<Try>\n\nSet the frame to 2.39:1 and compare.\n\n- a step\n\n</Try>',
      '<OurView>\n\nWe like 2:1 for this.\n\n</OurView>',
      '<TryLink href="x" />',
    ].join('\n\n');
    expect(() => compile(src)).not.toThrow();
  });

  it('ignores markers in code', () => {
    const { code } = compile('Write `[@key, p. 1]` to cite [@ebu-r95-2017, sec. 2].\n\n```\n[@also-ignored]\n```\n');
    expect(code).toContain('[@key, p. 1]');
    expect(html('Write `[@key, p. 1]` to cite [@ebu-r95-2017, sec. 2].\n')).toContain('<code>[@key, p. 1]</code> to cite<sup class="cites">');
  });

  it('can relax the paragraph rule to warnings, but never unknown keys', () => {
    const warnings: string[] = [];
    expect(() => compile('Uncited.\n', { rules: { strict: false }, warn: (m) => warnings.push(m) })).not.toThrow();
    expect(warnings[0]).toMatch(/no citation/);
    expect(fails('Uncited [@nope, p. 1].\n', { rules: { strict: false }, warn: () => {} })).toThrow(/not in/);
  });

  it('runs only on lessons', () => {
    const page = pathToFileURL(`${process.cwd()}/src/pages/other.mdx`);
    expect(() => compile('Uncited, but not a lesson.\n', {}, page)).not.toThrow();
  });
});

describe('reference formatting', () => {
  it('formats the existing library without gaps', () => {
    for (const r of references) {
      const f = formatReference(r);
      expect(f.title).toBe(r.title);
      expect(f.details).not.toMatch(/undefined|, ,/);
    }
    const smpte = formatReference(references.find((r) => r.id === 'smpte-st-59-1998')!);
    expect(smpte).toMatchObject({ italic: true, details: 'Society of Motion Picture and Television Engineers, SMPTE 59-1998, 1998', accessed: 'Accessed 28 Oct 2026' });
  });

  it('formats books, articles and films', () => {
    const book = ReferenceSchema.parse({
      id: 'b', type: 'book', title: 'Widescreen Cinema', author: [{ family: 'Belton', given: 'John' }],
      publisher: 'Harvard University Press', 'publisher-place': 'Cambridge, MA', issued: { 'date-parts': [[1992]] },
    });
    expect(formatReference(book)).toMatchObject({ authors: 'J. Belton', italic: true, details: 'Cambridge, MA: Harvard University Press, 1992' });
    const article = ReferenceSchema.parse({
      id: 'a', type: 'article-journal', title: 'A paper', author: [{ family: 'Doe', given: 'Ann Marie' }, { family: 'Roe' }, { literal: 'SMPTE' }],
      'container-title': 'SMPTE Motion Imaging Journal', volume: '120', issue: '4', page: '10-20', DOI: '10.5594/J18000',
    });
    expect(formatReference(article)).toMatchObject({
      authors: 'A. M. Doe, Roe and SMPTE', italic: false,
      details: 'SMPTE Motion Imaging Journal, vol. 120, no. 4, pp. 10–20', url: 'https://doi.org/10.5594/J18000',
    });
    const org = ReferenceSchema.parse({
      id: 'o', type: 'report', title: 'Spec, Version 1.1', author: [{ literal: 'DCI' }], publisher: 'DCI', number: 'Version 1.1', issued: { 'date-parts': [[2007]] },
    });
    expect(formatReference(org)).toMatchObject({ authors: 'DCI', details: '2007' });
    const film = ReferenceSchema.parse({ id: 'f', type: 'motion_picture', title: 'A talk', publisher: 'ASC', issued: { 'date-parts': [[2020, 5, 3]] } });
    expect(formatReference(film)).toMatchObject({ italic: true, details: 'ASC, 2020' });
  });
});

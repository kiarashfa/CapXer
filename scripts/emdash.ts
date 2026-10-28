// Em-dash detection for user-facing text (project rule: no em-dashes on the
// website or in public docs). Code comments are allowed to contain them, so
// code files are scanned with comments blanked out first.

/** The em-dash itself plus the ways it can be spelled in source. */
const EM_DASH = /—|&mdash;|&#8212;|&#x2014;|\\u2014|\\u\{2014\}/gi;

export interface Hit {
  line: number;
  col: number;
  text: string;
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

/**
 * Blank out comments while keeping line/column positions. Handles HTML
 * comments, block comments and line comments. A `//` right after a colon or
 * a quote is kept (URLs, strings), which can only hide a hit, never invent one.
 */
export function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])(\/\/[^\n]*)/g, (_m, pre: string, c: string) => pre + blank(c));
}

export function findEmDashes(text: string, opts: { code?: boolean } = {}): Hit[] {
  const src = opts.code ? stripComments(text) : text;
  const hits: Hit[] = [];
  const lines = src.split('\n');
  const original = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(EM_DASH)) {
      hits.push({ line: i + 1, col: (m.index ?? 0) + 1, text: (original[i] ?? '').trim() });
    }
  });
  return hits;
}

/** Extensions whose comments may hold em-dashes. */
export const CODE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.svelte', '.astro', '.css']);

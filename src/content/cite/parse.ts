// Parses Pandoc-style citation markers: `[@key, p. 12]` or several at once,
// `[@a, sec. 2; @b, table 1]`. Pure and DOM-free; used by the build plugin and tests.

/**
 * Locator labels a citation may use, based on CSL's locator terms. Every
 * citation must carry one, so a reader can find the supporting passage.
 */
export const LOCATORS = {
  'p.': 'page',
  'pp.': 'pages',
  'sec.': 'section',
  'ch.': 'chapter',
  table: 'table',
  'fig.': 'figure',
  item: 'item',
  'para.': 'paragraph',
  at: 'timestamp',
} as const;
export type LocatorLabel = keyof typeof LOCATORS;

// Writers often reach for these; the error names the label to use instead.
const SUGGEST: Record<string, LocatorLabel> = {
  p: 'p.', pg: 'p.', 'pg.': 'p.', page: 'p.', pages: 'pp.', pp: 'pp.',
  s: 'sec.', sec: 'sec.', section: 'sec.', '§': 'sec.',
  ch: 'ch.', chap: 'ch.', 'chap.': 'ch.', chapter: 'ch.',
  tab: 'table', 'tab.': 'table', tbl: 'table', 'tbl.': 'table',
  fig: 'fig.', figure: 'fig.',
  para: 'para.', paragraph: 'para.',
  t: 'at', time: 'at', timestamp: 'at',
};

export interface CiteItem {
  key: string;
  label: LocatorLabel;
  /** What follows the label: "12", "3.2", "12:34". */
  value: string;
  /** Label and value as the reader sees it: "p. 12". */
  locator: string;
}

export type ParseResult = { ok: true; items: CiteItem[] } | { ok: false; error: string };

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A complete marker in running text. Group 1 is the inside of the brackets. */
export const MARKER = /\[(@[^\][]*)\]/g;
/** Anything that starts like a citation; used to catch markers that never close. */
export const OPENER = /\[@/g;

/** Parses the inside of one marker (without the brackets), e.g. "@a, p. 3; @b, sec. 2". */
export function parseMarker(inner: string): ParseResult {
  const items: CiteItem[] = [];
  for (const raw of inner.split(';')) {
    const part = raw.trim();
    const m = /^@([^\s,]+)\s*(?:,\s*(.*))?$/.exec(part);
    if (!m) return { ok: false, error: `"${part}" is not a citation; write @key, locator` };
    const [, key, rest] = m;
    if (!KEY.test(key)) return { ok: false, error: `"@${key}" is not a valid reference key (lowercase letters, digits and hyphens)` };
    const loc = (rest ?? '').trim();
    if (!loc) return { ok: false, error: `@${key} has no locator; add where in the source, e.g. "@${key}, p. 12" (allowed: ${Object.keys(LOCATORS).join(', ')})` };
    const lm = /^(\S+)\s+(.+)$/.exec(loc);
    if (!lm) return { ok: false, error: `@${key}: locator "${loc}" needs a label and a value, e.g. "p. 12"` };
    const [, label, value] = lm;
    if (!(label in LOCATORS)) {
      const hint = SUGGEST[label.toLowerCase()];
      return { ok: false, error: `@${key}: unknown locator "${label}"${hint ? `; use "${hint}"` : ''} (allowed: ${Object.keys(LOCATORS).join(', ')})` };
    }
    items.push({ key, label: label as LocatorLabel, value: value.trim(), locator: `${label} ${value.trim()}` });
  }
  return { ok: true, items };
}

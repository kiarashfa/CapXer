// Formats a CSL-JSON reference for a lesson's source list, in a plain IEEE-like
// style: Authors, "Title," container, publisher, number, year. Link. Accessed date.
// Deliberately small: CapXer uses a handful of CSL types, and a full CSL
// processor (citeproc-js) is large and copyleft. CSL-JSON stays the storage
// format, so one can be swapped in later without touching the library.
import type { Reference } from '../../references/schema.ts';

export interface FormattedReference {
  authors?: string;
  title: string;
  /** Books, reports, standards and films are set in italics; parts of something in quotes. */
  italic: boolean;
  /** Container, edition, publisher, number, pages, year, joined with commas. */
  details: string;
  url?: string;
  /** "Accessed 28 Oct 2026". */
  accessed?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Name = NonNullable<Reference['author']>[number];
const initials = (given: string) =>
  given
    .split(/\s+/)
    .filter(Boolean)
    .map((g) => g.split('-').map((p) => `${p[0]}.`).join('-'))
    .join(' ');
const name = (n: Name) => ('literal' in n ? n.literal : n.given ? `${initials(n.given)} ${n.family}` : n.family);

export function formatNames(names: Name[] | undefined): string | undefined {
  if (!names?.length) return undefined;
  const list = names.map(name);
  if (list.length > 6) return `${list[0]} et al.`;
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function formatDate(d: { 'date-parts': number[][] } | undefined): string | undefined {
  const parts = d?.['date-parts'][0];
  if (!parts) return undefined;
  const [y, m, day] = parts;
  return [day, m ? MONTHS[m - 1] : undefined, y].filter((x) => x !== undefined).join(' ');
}

const PART_TYPES = new Set(['webpage', 'article-journal', 'chapter']);

export function formatReference(r: Reference): FormattedReference {
  const year = r.issued?.['date-parts'][0][0];
  const editors = formatNames(r.editor);
  const details: string[] = [
    r['container-title'] && (editors ? `in ${r['container-title']}, ed. ${editors}` : r['container-title']),
    r.volume && `vol. ${r.volume}`,
    r.issue && `no. ${r.issue}`,
    r.edition && `${r.edition} ed.`,
    r['publisher-place'] && r.publisher ? `${r['publisher-place']}: ${r.publisher}` : r.publisher,
    r.number,
    r.page && (/[-–]/.test(r.page) ? `pp. ${r.page.replace('-', '–')}` : `p. ${r.page}`),
    year && String(year),
  ].filter((x): x is string => !!x);
  // An organisation that is both author and publisher is named once, as the author.
  const drop = (x: string) => {
    const i = details.indexOf(x);
    if (i >= 0) details.splice(i, 1);
  };
  const authors = formatNames(r.author);
  if (authors && authors === r.publisher) drop(r.publisher);
  // A number already in the title ("..., Version 1.1") is not repeated.
  if (r.number && r.title.includes(r.number)) drop(r.number);
  return {
    authors,
    title: r.title,
    italic: !PART_TYPES.has(r.type),
    details: details.join(', '),
    url: r.DOI ? `https://doi.org/${r.DOI}` : r.URL,
    accessed: r.accessed ? `Accessed ${formatDate(r.accessed)}` : undefined,
  };
}

// Build-time citation plugin for lessons (Sätteri mdast plugin, Astro 7's Markdown engine).
//
// - Turns `[@key, locator]` markers into numbered citation links, numbered by
//   first appearance; a source cited again keeps its number.
// - Fails the build on an unknown key, a missing or unknown locator, or a
//   marker that never closes.
// - Enforces the citation rule (rules.ts): every factual paragraph and table
//   carries a citation unless it sits inside an exempt block (<Try>, <OurView>).
// - Hands the ordered source list to the page as front matter `sources`.
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { MARKER, OPENER, parseMarker, type CiteItem } from './parse.ts';
import { RULES, type CitationRules } from './rules.ts';

export interface CitationOptions {
  /** Every key in the reference library. */
  references: Iterable<string>;
  /** Which files the plugin runs on. Default: lessons only. */
  include?: (file: string) => boolean;
  rules?: Partial<CitationRules>;
  /** Where warnings go when rules.strict is false. */
  warn?: (message: string) => void;
}

/** What the plugin leaves in front matter for the lesson layout. */
export interface CitationData {
  /** Reference keys in order of first citation; source n is sources[n - 1]. */
  sources: string[];
}

export const isLesson = (file: string) => /[\\/]src[\\/]content[\\/]lessons[\\/]/.test(file);

// Minimal structural types; Sätteri's own are richer but this file stays engine-light.
interface Node {
  type: string;
  value?: string;
  name?: string | null;
  children?: Node[];
  position?: { start: { line: number; column: number } };
}
interface Ctx {
  data: Record<string, any>;
  parent(node: Node): Node | undefined;
  textContent(node: Node): string;
  replaceNode(node: Node, content: unknown[]): void;
}

const hasMarker = (text: string) => new RegExp(MARKER.source).test(text);

export function citations(options: CitationOptions) {
  const keys = new Set(options.references);
  const include = options.include ?? isLesson;
  const rules: CitationRules = { ...RULES, ...options.rules };
  const exempt = new Set(rules.exempt);
  const warn = options.warn ?? ((m: string) => console.warn(m));

  return (factory: { fileURL: URL | undefined }) => {
    const path = factory.fileURL ? fileURLToPath(factory.fileURL) : '<input>';
    if (factory.fileURL && !include(path)) return null;
    const shown = factory.fileURL ? relative(process.cwd(), path).replaceAll('\\', '/') : path;

    // Fresh state per document.
    const order = new Map<string, number>();
    const errors: string[] = [];
    const uncited: string[] = [];
    const at = (node: Node) => `${shown}:${node.position?.start.line ?? '?'}:${node.position?.start.column ?? '?'}`;

    const inExempt = (node: Node, ctx: Ctx) => {
      for (let p = ctx.parent(node); p; p = ctx.parent(p)) {
        if ((p.type === 'mdxJsxFlowElement' || p.type === 'mdxJsxTextElement') && p.name && exempt.has(p.name)) return true;
      }
      return false;
    };
    const inCode = (node: Node, ctx: Ctx) => {
      for (let p = ctx.parent(node); p; p = ctx.parent(p)) if (p.type === 'inlineCode' || p.type === 'code') return true;
      return false;
    };

    const link = (item: CiteItem, n: number) => ({
      type: 'link',
      url: `#source-${n}`,
      data: {
        hProperties: {
          className: ['cite'],
          'data-source': String(n),
          'data-locator': item.locator,
          'aria-label': `Source ${n}, ${item.locator}`,
        },
      },
      // Non-breaking spaces keep "[1, p. 12" together; a long section name may still wrap.
      children: [{ type: 'text', value: `[${n}, ${item.label} ${item.value}]` }],
    });

    return {
      name: 'capxer-citations',
      options: { position: true },

      text(node: Node, ctx: Ctx) {
        const value = node.value ?? '';
        if (!value.includes('[@') || inCode(node, ctx)) return;
        const out: unknown[] = [];
        let last = 0;
        let opened = 0;
        for (const m of value.matchAll(MARKER)) {
          const parsed = parseMarker(m[1]);
          if (!parsed.ok) {
            errors.push(`${at(node)}  ${parsed.error}`);
            continue;
          }
          const unknown = parsed.items.filter((i) => !keys.has(i.key));
          if (unknown.length) {
            for (const i of unknown) errors.push(`${at(node)}  [@${i.key}] is not in src/references/references.json`);
            continue;
          }
          if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
          const group = parsed.items.map((item) => {
            if (!order.has(item.key)) order.set(item.key, order.size + 1);
            return link(item, order.get(item.key)!);
          });
          group.forEach((l, i) => {
            if (i > 0) out.push({ type: 'text', value: ' ' });
            out.push(l);
          });
          last = m.index + m[0].length;
          opened++;
        }
        const openers = [...value.matchAll(OPENER)].length;
        const complete = [...value.matchAll(MARKER)].length;
        if (openers > complete) errors.push(`${at(node)}  a citation "[@" is not closed with "]" (or contains formatting; keep markers plain text)`);
        if (!opened) return;
        if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
        ctx.replaceNode(node, out);
      },

      paragraph(node: Node, ctx: Ctx) {
        if (!rules.paragraphs) return;
        const text = ctx.textContent(node).trim();
        // A paragraph that is only a component, image or punctuation states nothing.
        if (!/[\p{L}\p{N}]/u.test(text) || hasMarker(text) || inExempt(node, ctx)) return;
        uncited.push(`${at(node)}  no citation: "${text.length > 70 ? `${text.slice(0, 67)}...` : text}"`);
      },

      table(node: Node, ctx: Ctx) {
        if (!rules.tables) return;
        if (hasMarker(ctx.textContent(node)) || inExempt(node, ctx)) return;
        uncited.push(`${at(node)}  table has no citation (cite in a cell or the header row)`);
      },

      after(_root: Node, ctx: Ctx) {
        if (uncited.length && !rules.strict) for (const u of uncited) warn(`[citations] ${u}`);
        const problems = rules.strict ? [...errors, ...uncited] : errors;
        if (problems.length) {
          throw new Error(
            `Citation check failed, ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}\n` +
              `Every factual paragraph and table needs [@key, locator]; instructions go in <Try>, opinion in <OurView>.`,
          );
        }
        const data: CitationData = { sources: [...order.keys()] };
        const astro = ctx.data.astro;
        if (astro?.frontmatter) astro.frontmatter.sources = data.sources;
        ctx.data.citations = data;
      },
    };
  };
}

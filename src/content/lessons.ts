// Build-time helpers for lessons (Astro pages only; never shipped to the browser).
import { getCollection, type CollectionEntry } from 'astro:content';
import type { PanelId } from '../setup/types.ts';
import { url } from '../lib/url.ts';
import { TOPICS } from './topics.ts';

export type Lesson = CollectionEntry<'lessons'>;

export interface LessonLink {
  title: string;
  href: string;
  minutes: number;
}

/** Reading time at about 200 words a minute, ignoring citation markers, components and markup. */
export function readingMinutes(body: string): number {
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/\[@[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`|-]/g, ' ');
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / 200));
}

export const lessonUrl = (id: string) => url(`lessons/${id}`);

export async function getLessons(): Promise<Lesson[]> {
  const all = await getCollection('lessons');
  return all.sort(
    (a, b) =>
      TOPICS[a.data.topic].order - TOPICS[b.data.topic].order ||
      a.data.order - b.data.order ||
      a.data.title.localeCompare(b.data.title),
  );
}

/** "Learn" links per viewfinder panel, from the lessons' `tools` front matter. */
export async function lessonLinksByPanel(): Promise<Partial<Record<PanelId, LessonLink[]>>> {
  const out: Partial<Record<PanelId, LessonLink[]>> = {};
  for (const l of await getLessons()) {
    for (const p of l.data.tools) {
      (out[p] ??= []).push({
        title: l.data.title,
        href: lessonUrl(l.id),
        minutes: readingMinutes(l.body ?? ''),
      });
    }
  }
  return out;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const longDate = (d: Date) =>
  `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

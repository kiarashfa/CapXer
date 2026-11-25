import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TOPICS } from './content/topics.ts';

// Lessons: one folder per lesson, src/content/lessons/<slug>/index.mdx, with its
// assets beside it. The folder name is the id and the URL (/lessons/<slug>/).
const lessons = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/content/lessons',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.strictObject({
    title: z.string().min(1).max(80),
    /** One sentence on what the lesson covers (not a factual claim, so not cited). */
    summary: z.string().min(1).max(200),
    topic: z.enum(Object.keys(TOPICS) as [keyof typeof TOPICS, ...(keyof typeof TOPICS)[]]),
    /** Viewfinder panels that link to this lesson ("Learn" row). */
    tools: z
      .array(z.enum(['camera', 'frame', 'lens', 'guides', 'live', 'exposure', 'info', 'saved']))
      .default([]),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    /** Sort order inside a topic, lowest first. */
    order: z.int().default(100),
  }),
});

export const collections = { lessons };

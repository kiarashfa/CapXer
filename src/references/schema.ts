import { z } from 'zod';

// The subset of CSL-JSON (https://citationstyles.org) that CapXer's reference
// library uses. One library serves both the camera database and the lessons.

const datePartsSchema = z.strictObject({
  'date-parts': z.array(z.array(z.int()).min(1).max(3)).length(1),
});

export const ReferenceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  type: z.enum(['webpage', 'standard', 'book', 'article-journal', 'report', 'chapter']),
  title: z.string().min(1),
  publisher: z.string().min(1).optional(),
  author: z.array(z.union([z.strictObject({ family: z.string(), given: z.string().optional() }), z.strictObject({ literal: z.string() })])).optional(),
  number: z.string().optional(),
  issued: datePartsSchema.optional(),
  URL: z.url().optional(),
  accessed: datePartsSchema.optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;
